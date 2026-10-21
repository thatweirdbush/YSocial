using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Infrastructure;
using YSocial.Infrastructure.Media;

namespace YSocial.Application.UnitTests.Media;

public class CloudinaryMediaStorageTests
{
    // Pins what Cloudinary receives: a change here changes what is stored (and the EXIF/GPS stripping claim)
    [Fact]
    public void ImageIncomingTransformation_LimitsSizeAndStripsProfile()
        => CloudinaryMediaStorage.IncomingTransformation(MediaKind.Image, MediaPurpose.Post)!.Generate()
            .Should().Be("c_limit,fl_strip_profile,h_2048,w_2048");

    [Fact]
    public void AvatarIncomingTransformation_CropsSquareAndStripsProfile()
        => CloudinaryMediaStorage.IncomingTransformation(MediaKind.Image, MediaPurpose.Avatar)!.Generate()
            .Should().Be("c_fill,fl_strip_profile,g_auto,h_512,w_512");

    [Fact]
    public void VideoHasNoIncomingTransformation()
        => CloudinaryMediaStorage.IncomingTransformation(MediaKind.Video, MediaPurpose.Post).Should().BeNull();

    [Fact]
    public void OwnsUrl_UsesTheConfiguredCloudName()
    {
        var storage = new CloudinaryMediaStorage(new CloudinarySettings("demo", "key", "secret"), NullLogger<CloudinaryMediaStorage>.Instance);

        storage.OwnsUrl("https://res.cloudinary.com/demo/image/upload/a.jpg").Should().BeTrue();
        storage.OwnsUrl("https://res.cloudinary.com/other/image/upload/a.jpg").Should().BeFalse();
    }

    [Theory]
    [InlineData("", "k", "s")]
    [InlineData("c", "", "s")]
    [InlineData("c", "k", "")]
    [InlineData("c", " ", "s")]
    public async Task MissingKey_SelectsUnavailableStorage_ThatAnswers503AndOwnsNothing(string cloud, string key, string secret)
    {
        using var provider = Provider(cloud, key, secret);

        var storage = provider.GetRequiredService<IMediaStorage>();

        storage.Should().BeOfType<UnavailableMediaStorage>();
        storage.OwnsUrl("https://res.cloudinary.com/c/image/upload/a.jpg").Should().BeFalse();
        await storage.Invoking(s => s.DeleteAsync([new StoredMediaRef("p", MediaKind.Image)], default)).Should().ThrowAsync<MediaStorageUnavailableException>();
        await storage.Invoking(s => s.UploadAsync(new MediaUpload(MediaAssetId.New(), "p", MediaKind.Image, MediaPurpose.Post, "image/jpeg", Stream.Null), default))
            .Should().ThrowAsync<MediaStorageUnavailableException>();
    }

    [Fact]
    public void AllKeysPresent_SelectsCloudinaryStorage()
    {
        using var provider = Provider("demo", "key", "secret");

        provider.GetRequiredService<IMediaStorage>().Should().BeOfType<CloudinaryMediaStorage>();
    }

    [Fact]
    public void Storage_IsSingleton_SoHealthAndHandlersAgree()
    {
        using var provider = Provider("demo", "key", "secret");

        provider.GetRequiredService<IMediaStorage>().Should().BeSameAs(provider.GetRequiredService<IMediaStorage>());
    }

    private static ServiceProvider Provider(string cloud, string key, string secret)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cloudinary:CloudName"] = cloud,
            ["Cloudinary:ApiKey"] = key,
            ["Cloudinary:ApiSecret"] = secret,
            ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=x"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddInfrastructure(configuration);

        return services.BuildServiceProvider();
    }
}
