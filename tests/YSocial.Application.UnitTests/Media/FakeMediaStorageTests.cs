using FluentAssertions;
using Xunit;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

/// <summary>
/// The fake is what every upload/sweep test stands on: its own behavior is pinned here.
/// </summary>
public class FakeMediaStorageTests
{
    private static MediaUpload Upload(string publicId = "ysocial/test/posts/a", MediaKind? kind = null)
        => new(MediaAssetId.New(), publicId, kind ?? MediaKind.Image, MediaPurpose.Post, "image/jpeg", new MemoryStream(new byte[100]));

    [Fact]
    public async Task Upload_StoresFile_ReturnsOwnedUrl()
    {
        var storage = new FakeMediaStorage();

        var stored = await storage.UploadAsync(Upload(), default);

        storage.StoredIds.Should().Equal("ysocial/test/posts/a");
        stored.Bytes.Should().Be(100);
        storage.OwnsUrl(stored.Url).Should().BeTrue();
        stored.PosterUrl.Should().BeNull();
    }

    [Fact]
    public async Task Upload_Video_HasPosterAndDuration()
    {
        var stored = await new FakeMediaStorage().UploadAsync(Upload(kind: MediaKind.Video), default);

        stored.PosterUrl.Should().Contain("so_0").And.EndWith(".jpg");
        stored.DurationSeconds.Should().Be(12.5);
    }

    [Fact]
    public async Task BeforeUploadFault_StoresNothing()
    {
        var storage = new FakeMediaStorage { BeforeUpload = (_, attempt) => attempt == 2 ? throw new MediaStorageUnavailableException("x") : Task.CompletedTask };

        await storage.UploadAsync(Upload("a"), default);
        var act = () => storage.UploadAsync(Upload("b"), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        storage.StoredIds.Should().Equal("a");
    }

    [Fact]
    public async Task AfterStoreFault_LeavesTheFileBehind()
    {
        var storage = new FakeMediaStorage { AfterStore = (_, _) => throw new MediaStorageUnavailableException("answer lost") };

        var act = () => storage.UploadAsync(Upload("a"), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        storage.StoredIds.Should().Equal("a");
    }

    [Fact]
    public async Task Delete_MissingFile_IsSuccess_AndRecorded()
    {
        var storage = new FakeMediaStorage();

        await storage.DeleteAsync([new StoredMediaRef("nope", MediaKind.Image)], default);

        storage.DeleteRequests.Should().Equal("nope");
    }

    [Fact]
    public async Task FailDeletes_KeepsFiles_AndThrows()
    {
        var storage = new FakeMediaStorage();
        await storage.UploadAsync(Upload("a"), default);
        storage.FailDeletes = true;

        var act = () => storage.DeleteAsync([new StoredMediaRef("a", MediaKind.Image)], default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        storage.StoredIds.Should().Equal("a");
    }

    [Fact]
    public async Task Cancelled_BeforeStoring_StoresNothing()
    {
        var storage = new FakeMediaStorage();
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var act = () => storage.UploadAsync(Upload("a"), cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
        storage.StoredIds.Should().BeEmpty();
    }
}
