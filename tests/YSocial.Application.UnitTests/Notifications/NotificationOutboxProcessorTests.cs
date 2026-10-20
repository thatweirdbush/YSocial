using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;
using YSocial.Application.Models;
using YSocial.Infrastructure.Notifications;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Notifications;

public sealed class NotificationOutboxProcessorTests : IDisposable
{
    private readonly SqliteTestDatabase _database = new();
    private readonly IClientProxy _proxy = Substitute.For<IClientProxy>();
    private readonly IHubContext<NotificationHub> _hub = Substitute.For<IHubContext<NotificationHub>>();
    private readonly YSocialDbContext _db;
    private readonly NotificationOutboxProcessor _processor;

    public NotificationOutboxProcessorTests()
    {
        var clients = Substitute.For<IHubClients>();
        clients.User(Arg.Any<string>()).Returns(_proxy);
        _hub.Clients.Returns(clients);

        _db = _database.NewContext();
        _processor = new NotificationOutboxProcessor(_db, _hub, NullLogger<NotificationOutboxProcessor>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _database.Dispose();
    }

    private static NotificationEnvelope Envelope(Guid recipientId)
        => new(recipientId, new NotificationDto(Guid.NewGuid(), "NewLike", "like", "New Like", "x liked your post.", DateTime.UtcNow, false, Guid.NewGuid(), Guid.NewGuid(), "X", "x_user", null));

    private void Enqueue(NotificationEnvelope envelope)
    {
        _db.NotificationOutboxMessages.Add(new NotificationOutboxMessage(Guid.NewGuid(), "NewLike", JsonSerializer.Serialize(envelope)));
        _db.SaveChanges();
    }

    /// <summary>
    /// Messages as stored (fresh context: the processor's tracker must not hide what really was saved).
    /// </summary>
    private List<NotificationOutboxMessage> Stored()
    {
        using var fresh = _database.NewContext();
        return fresh.NotificationOutboxMessages.AsNoTracking().ToList();
    }

    [Fact]
    public async Task Outbox_ProcessedMessageRemoved_PayloadSentToRecipient()
    {
        var recipient = Guid.NewGuid();
        var envelope = Envelope(recipient);
        Enqueue(envelope);

        var delivered = await _processor.ProcessBatchAsync();

        delivered.Should().Be(1);
        Stored().Should().BeEmpty();
        _hub.Clients.Received(1).User(recipient.ToString());
        await _proxy.Received(1).SendCoreAsync(
            "ReceiveNotification",
            Arg.Is<object?[]>(args => args.Length == 1 && args[0] is NotificationDto && ((NotificationDto)args[0]!).Id == envelope.Payload.Id),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Outbox_FailedMessage_StaysForRetry_ThenDroppedAfterMaxAttempts()
    {
        Enqueue(Envelope(Guid.NewGuid()));
        _proxy.SendCoreAsync(Arg.Any<string>(), Arg.Any<object?[]>(), Arg.Any<CancellationToken>()).Throws(new InvalidOperationException("hub down"));

        await _processor.ProcessBatchAsync();

        Stored().Should().ContainSingle().Which.Attempts.Should().Be(1);

        for (var i = 1; i < NotificationOutboxProcessor.MaxAttempts; i++)
        {
            await _processor.ProcessBatchAsync();
        }

        Stored().Should().BeEmpty("exhausted messages are dropped");
    }

    [Fact]
    public async Task Outbox_BatchIsBounded_RestWaitsForNextBatch()
    {
        for (var i = 0; i < NotificationOutboxProcessor.BatchSize + 3; i++)
        {
            Enqueue(Envelope(Guid.NewGuid()));
        }

        var first = await _processor.ProcessBatchAsync();
        var second = await _processor.ProcessBatchAsync();

        first.Should().Be(NotificationOutboxProcessor.BatchSize);
        second.Should().Be(3);
        Stored().Should().BeEmpty();
    }

    [Fact]
    public async Task Outbox_OldestMessagesFirst()
    {
        var recipients = Enumerable.Range(0, NotificationOutboxProcessor.BatchSize + 1).Select(_ => Guid.NewGuid()).ToList();
        foreach (var recipient in recipients)
        {
            Enqueue(Envelope(recipient));
            await Task.Delay(2);
        }

        await _processor.ProcessBatchAsync();

        var left = Stored().Single();
        JsonSerializer.Deserialize<NotificationEnvelope>(left.Content)!.RecipientId.Should().Be(recipients[^1], "the newest message waits for the next batch");
    }

    [Fact]
    public async Task Outbox_PayloadJson_UsesFeContractFields()
    {
        var envelope = Envelope(Guid.NewGuid());

        var json = JsonSerializer.Serialize(envelope.Payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        using var doc = JsonDocument.Parse(json);
        doc.RootElement.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(
            ["id", "type", "kind", "title", "message", "createdAt", "isRead", "targetId", "senderId", "senderName", "senderUsername", "senderAvatar"]);
        await Task.CompletedTask;
    }
}
