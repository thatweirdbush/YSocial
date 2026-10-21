using FluentAssertions;
using Xunit;
using YSocial.Infrastructure.Media;

namespace YSocial.Application.UnitTests.Media;

public class CloudinaryUrlTests
{
    private const string Cloud = "demo";

    [Theory]
    [InlineData("https://res.cloudinary.com/demo/image/upload/v1/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/video/upload/v123/ysocial/dev/posts/abc.mp4")]
    [InlineData("https://res.cloudinary.com/demo/video/upload/so_0/v123/ysocial/dev/posts/abc.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg?x=1")]
    [InlineData("https://res.cloudinary.com:443/demo/image/upload/a.jpg")]
    [InlineData("https://RES.CLOUDINARY.COM/demo/image/upload/a.jpg")]
    public void Owns_OurAssetUrls(string url)
        => CloudinaryUrl.Owns(url, Cloud).Should().BeTrue();

    [Theory]
    [InlineData("https://res.cloudinary.com.evil.com/demo/image/upload/a.jpg")]
    [InlineData("https://evilres.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com@evil.com/demo/image/upload/a.jpg")]
    [InlineData("https://user:pw@res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com./demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com:8443/demo/image/upload/a.jpg")]
    [InlineData("http://res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("//res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("ftp://res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/other/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/DEMO/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/raw/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/fetch/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/")]
    [InlineData("https://res.cloudinary.com//demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo//image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/../../other/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/%2e%2e/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/%2E%2e/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/a%2fb.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/a%5cb.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/a\\b.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/./a.jpg")]
    [InlineData("https://media.giphy.com/media/x/giphy.gif")]
    [InlineData("https://example.com/demo/image/upload/a.jpg")]
    [InlineData("data:image/png;base64,AAAA")]
    [InlineData("javascript:alert(1)")]
    [InlineData("not a url")]
    [InlineData("")]
    public void Owns_RejectsEverythingElse(string url)
        => CloudinaryUrl.Owns(url, Cloud).Should().BeFalse();

    [Fact]
    public void Owns_Null_IsFalse()
        => CloudinaryUrl.Owns(null, Cloud).Should().BeFalse();

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public void Owns_WithoutCloudName_IsFalse(string cloud)
        => CloudinaryUrl.Owns("https://res.cloudinary.com/demo/image/upload/a.jpg", cloud).Should().BeFalse();

    [Fact]
    public void PosterOf_VideoUrl_InsertsFrameZeroAndSwapsExtension()
        => CloudinaryUrl.PosterOf("https://res.cloudinary.com/demo/video/upload/v123/ysocial/dev/posts/abc.mp4")
            .Should().Be("https://res.cloudinary.com/demo/video/upload/so_0/v123/ysocial/dev/posts/abc.jpg");

    [Fact]
    public void PosterOf_UrlWithoutVersion_StillInsertsAfterUpload()
        => CloudinaryUrl.PosterOf("https://res.cloudinary.com/demo/video/upload/abc.mov")
            .Should().Be("https://res.cloudinary.com/demo/video/upload/so_0/abc.jpg");

    // Deny guards (avatarUrl / imageUrl) must fail CLOSED: anything a browser would resolve to OUR cloud is ours
    [Theory]
    [InlineData("https://res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("http://res.cloudinary.com/demo/image/upload/ysocial/production/posts/x")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/x/../ysocial/posts/x.jpg")]
    [InlineData("https://res.cloudinary.com/demo/image/upload/%2e%2e/ysocial/x.jpg")]
    [InlineData("https://res.cloudinary.com//demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com./demo/image/upload/a.jpg")]
    [InlineData("https://RES.CLOUDINARY.COM:443/DEMO/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com:8443/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo/raw/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com/demo")]
    public void Targets_IsLenient_ForTheDenyGuards(string url)
        => CloudinaryUrl.Targets(url, Cloud).Should().BeTrue();

    [Theory]
    [InlineData("https://res.cloudinary.com/other/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com.evil.com/demo/image/upload/a.jpg")]
    [InlineData("https://res.cloudinary.com@evil.com/demo/image/upload/a.jpg")]
    [InlineData("https://media.giphy.com/media/x/giphy.gif")]
    [InlineData("ftp://res.cloudinary.com/demo/image/upload/a.jpg")]
    [InlineData("not a url")]
    [InlineData("")]
    public void Targets_LeavesForeignUrlsAlone(string url)
        => CloudinaryUrl.Targets(url, Cloud).Should().BeFalse();

    [Fact]
    public void Targets_WithoutCloudName_IsFalse()
        => CloudinaryUrl.Targets("https://res.cloudinary.com/demo/image/upload/a.jpg", "").Should().BeFalse();
}
