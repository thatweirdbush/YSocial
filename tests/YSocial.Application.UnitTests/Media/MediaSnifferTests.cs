using FluentAssertions;
using Xunit;
using YSocial.Application.Features.Media;
using YSocial.Domain.Media;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

public class MediaSnifferTests
{
    private static SniffedMedia? Detect(byte[] bytes) => MediaSniffer.Detect(new MemoryStream(bytes));

    public static TheoryData<string, byte[], string, int, int> Images => new()
    {
        { "png", MediaSamples.Png(640, 480), "image/png", 640, 480 },
        { "jpeg", MediaSamples.Jpeg(1280, 720), "image/jpeg", 1280, 720 },
        { "jpeg exif", MediaSamples.Jpeg(800, 600, withExifGps: true), "image/jpeg", 800, 600 },
        { "gif", MediaSamples.Gif(320, 200), "image/gif", 320, 200 },
        { "webp lossy", MediaSamples.WebpLossy(500, 400), "image/webp", 500, 400 },
        { "webp lossless", MediaSamples.WebpLossless(501, 401), "image/webp", 501, 401 },
        { "webp extended", MediaSamples.WebpExtended(4000, 3000), "image/webp", 4000, 3000 },
    };

    [Theory]
    [MemberData(nameof(Images))]
    public void Detect_Images_ReturnsKindMimeAndDimensions(string name, byte[] bytes, string mime, int width, int height)
    {
        var sniffed = Detect(bytes);

        sniffed.Should().NotBeNull(name);
        sniffed!.Kind.Should().Be(MediaKind.Image);
        (sniffed.ContentType, sniffed.Width, sniffed.Height).Should().Be((mime, width, height));
    }

    [Theory]
    [InlineData("mp4", "video/mp4")]
    [InlineData("mov", "video/quicktime")]
    [InlineData("webm", "video/webm")]
    public void Detect_Videos_ReturnsKindMimeWithoutDimensions(string name, string mime)
    {
        var bytes = name switch { "mp4" => MediaSamples.Mp4(), "mov" => MediaSamples.Mov(), _ => MediaSamples.WebM() };

        var sniffed = Detect(bytes);

        sniffed.Should().NotBeNull();
        sniffed!.Kind.Should().Be(MediaKind.Video);
        sniffed.ContentType.Should().Be(mime);
        sniffed.Width.Should().BeNull();
    }

    [Fact]
    public void Detect_JpegWithBigExifBeforeSof_StillFindsDimensions()
    {
        var big = MediaSamples.Jpeg(100, 50, withExifGps: true, app2Bytes: 60_000);

        Detect(big)!.Height.Should().Be(50);
    }

    [Theory]
    [InlineData("svg")]
    [InlineData("heic")]
    [InlineData("avif")]
    [InlineData("exe")]
    [InlineData("text")]
    [InlineData("empty")]
    [InlineData("one byte")]
    public void Detect_Rejected_ReturnsNull(string name)
    {
        var bytes = name switch
        {
            "svg" => MediaSamples.Svg(),
            "heic" => MediaSamples.Heic(),
            "avif" => MediaSamples.Avif(),
            "exe" => MediaSamples.Exe(),
            "text" => MediaSamples.Text(),
            "empty" => [],
            _ => new byte[] { 0xFF }
        };

        Detect(bytes).Should().BeNull();
    }

    [Fact]
    public void Detect_RenamedExecutableAsPng_IsStillRejected()
        => Detect(MediaSamples.Exe()).Should().BeNull("only magic bytes decide, never the file name or content type");

    [Fact]
    public void Detect_PngWithoutDimensions_ReturnsNull()
        => Detect(MediaSamples.Png(1, 1)[..12]).Should().BeNull();

    [Fact]
    public void Detect_RewindsTheStream()
    {
        var stream = new MemoryStream(MediaSamples.Png(10, 10, padding: 50));

        MediaSniffer.Detect(stream);

        stream.Position.Should().Be(0);
    }
}
