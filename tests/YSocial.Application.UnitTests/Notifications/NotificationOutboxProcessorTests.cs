using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using System.Text.Json;
using Xunit;
using YSocial.Application.Models;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Notifications;
using YSocial.Infrastructure.Notifications.Outbox;

namespace YSocial.Application.UnitTests.Notifications;

public class NotificationOutboxProcessorTests
{
    // Own list: the static store list is reset by other test classes running in parallel
    private readonly MockNotificationOutboxStore _store = new() { Messages = [] };
    private readonly IClientProxy _proxy = Substitute.For<IClientProxy>();
    private readonly IHubContext<NotificationHub> _hub = Substitute.For<IHubContext<NotificationHub>>();
    private readonly NotificationOutboxProcessor _processor;

    public NotificationOutboxProcessorTests()
    {
        var clients = Substitute.For<IHubClients>();
        clients.User(Arg.Any<string>()).Returns(_proxy);
        _hub.Clients.Returns(clients);
        _processor = new NotificationOutboxProcessor(_store, _hub, NullLogger<NotificationOutboxProcessor>.Instance);
    }

    private static NotificationEnvelope Envelope(Guid recipientId)
        => new(recipientId, new NotificationDto(Guid.NewGuid(), "NewLike", "like", "New Like", "x liked your post.", DateTime.UtcNow, false, Guid.NewGuid(), Guid.NewGuid(), "X", null));

    private void Enqueue(NotificationEnvelope envelope)
    {
        lock (_store.Messages)
        {
            _store.Messages.Add(new NotificationOutboxMessage(Guid.NewGuid(), "NewLike", JsonSerializer.Serialize(envelope)));
        }
    }

    [Fact]
    public async Task Outbox_ProcessedMessageRemoved_PayloadSentToRecipient()
    {
        var recipient = Guid.NewGuid();
        var envelope = Envelope(recipient);
        Enqueue(envelope);

        var delivered = await _processor.ProcessBatchAsync();

        delivered.Should().Be(1);
        _store.Messages.Should().BeEmpty();
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

        _store.Messages.Should().ContainSingle().Which.Attempts.Should().Be(1);

        for (var i = 1; i < NotificationOutboxProcessor.MaxAttempts; i++)
        {
            await _processor.ProcessBatchAsync();
        }

        _store.Messages.Should().BeEmpty("exhausted messages are dropped");
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
        _store.Messages.Should().BeEmpty();
    }

    [Fact]
    public async Task Outbox_PayloadJson_UsesFeContractFields()
    {
        var envelope = Envelope(Guid.NewGuid());

        var json = JsonSerializer.Serialize(envelope.Payload, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        using var doc = JsonDocument.Parse(json);
        doc.RootElement.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(
            ["id", "type", "kind", "title", "message", "createdAt", "isRead", "targetId", "senderId", "senderName", "senderAvatar"]);
        await Task.CompletedTask;
    }
}
