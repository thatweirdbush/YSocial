using FluentAssertions;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Xunit;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Media;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Posts;

public class PostMediaTests
{
    private static readonly UserId Author = UserId.New();

    private static PostMedia Item(string name = "a", MediaKind? kind = null)
        => PostMedia.Create(MediaAssetId.New(), kind ?? MediaKind.Image, $"https://res.cloudinary.com/demo/image/upload/{name}.jpg", null, 800, 600, null);

    private static IReadOnlyList<PostMedia> Items(int count) => Enumerable.Range(0, count).Select(i => Item(i.ToString())).ToList();

    [Fact]
    public void Create_KeepsInputOrderAsPosition_AndSnapshotsFields()
    {
        var video = PostMedia.Create(MediaAssetId.New(), MediaKind.Video, "https://x/v.mp4", "https://x/v.jpg", 1920, 1080, 12.5);
        var first = Item("first");

        var post = Post.Create(Author, "hi", media: [first, video]);

        post.Media.Select(m => m.Position).Should().Equal(0, 1);
        post.Media[0].MediaId.Should().Be(first.MediaId);
        post.Media[1].Should().Match<PostMedia>(m => m.Kind == MediaKind.Video && m.PosterUrl == "https://x/v.jpg" && m.DurationSeconds == 12.5 && m.Width == 1920 && m.Height == 1080);
    }

    [Fact]
    public void Create_WithoutMedia_HasEmptyList()
        => Post.Create(Author, "hi").Media.Should().BeEmpty();

    [Fact]
    public void Create_AcceptsTenMedia()
        => Post.Create(Author, "hi", media: Items(10)).Media.Should().HaveCount(10);

    [Fact]
    public void Create_RejectsElevenMedia()
        => ShouldBreak(() => Post.Create(Author, "hi", media: Items(11)), ErrorCodes.PostContentInvalid);

    [Fact]
    public void Create_EmptyContent_WithMedia_IsAllowed()
        => Post.Create(Author, "", media: Items(1)).Content.Should().BeEmpty();

    [Fact]
    public void Create_EmptyContent_WithExternalImageUrl_IsAllowed()
        => Post.Create(Author, "  ", "https://media.giphy.com/x.gif").ImageUrl.Should().NotBeNull();

    [Fact]
    public void Create_EmptyContent_WithoutMedia_IsRejected()
        => ShouldBreak(() => Post.Create(Author, "", null), ErrorCodes.PostContentInvalid);

    [Fact]
    public void UpdateContent_ToEmpty_IsAllowed_WhenPostHasMedia()
    {
        var post = Post.Create(Author, "hi", media: Items(1));

        post.UpdateContent(Author, "");

        post.Content.Should().BeEmpty();
    }

    [Fact]
    public void UpdateContent_ToEmpty_IsRejected_WhenPostHasNoMedia()
    {
        var post = Post.Create(Author, "hi");

        ShouldBreak(() => post.UpdateContent(Author, ""), ErrorCodes.PostContentInvalid);
    }

    private static void ShouldBreak(Action act, string code)
    {
        var rule = act.Should().Throw<BusinessRuleValidationException>().Which.BrokenRule.Should().BeAssignableTo<IClassifiedRule>().Subject;

        rule.Code.Should().Be(code);
        rule.Kind.Should().Be(RuleViolationKind.Invalid);
    }
}
