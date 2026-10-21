using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Posts;

public class HashtagParserTests
{
    private sealed record Case(string Name, string Content, Tag[] Tags);

    private sealed record Tag(string Key, string Display);

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public static TheoryData<string> FixtureCases()
    {
        var data = new TheoryData<string>();
        foreach (var c in LoadFixture()) data.Add(c.Name);
        return data;
    }

    private static Case[] LoadFixture()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "YSocial.sln"))) dir = dir.Parent;

        var path = Path.Combine(dir!.FullName, "docs", "fixtures", "hashtag-parity.json");
        return JsonSerializer.Deserialize<Case[]>(File.ReadAllText(path), Json)!;
    }

    // Same fixture file is loaded by the FE tests: both sides must produce identical output
    [Theory]
    [MemberData(nameof(FixtureCases))]
    public void Extract_MatchesGoldenFixture(string name)
    {
        var fixture = LoadFixture().Single(c => c.Name == name);

        HashtagParser.Extract(fixture.Content).Select(t => new Tag(t.Key, t.Display)).Should().Equal(fixture.Tags);
    }

    // Same cases as FE `lib/text.ts` (HASHTAG_PATTERN, foldText): parity guard
    [Theory]
    [InlineData("hello #World", new[] { "world" })]
    [InlineData("#start of text", new[] { "start" })]
    [InlineData("line one\n#second line", new[] { "second" })]
    [InlineData("a#notatag b", new string[0])]
    [InlineData("https://x.com/#fragment", new string[0])]
    [InlineData("#tag1 #Tag1 #TAG1", new[] { "tag1" })]
    [InlineData("#a_b #c-d", new[] { "a_b", "c" })]
    [InlineData("#", new string[0])]
    [InlineData("# space", new string[0])]
    [InlineData("#123", new[] { "123" })]
    public void Extract_FollowsFrontendPattern(string content, string[] keys)
        => HashtagParser.Extract(content).Select(t => t.Key).Should().Equal(keys);

    [Theory]
    [InlineData("ĐàLạt", "dalat")]
    [InlineData("đẹp", "dep")]
    [InlineData("Hà_Nội", "ha_noi")]
    [InlineData("SAIGON", "saigon")]
    public void Fold_StripsDiacritics_MapsD_AndLowercases(string tag, string key)
        => HashtagParser.Fold(tag).Should().Be(key);

    [Fact]
    public void Extract_NormalizesDecomposedInput_ToSameKey()
    {
        var decomposed = "#DàLaṭ".Normalize(System.Text.NormalizationForm.FormD);

        HashtagParser.Extract(decomposed).Should().ContainSingle().Which.Key.Should().Be("dalat");
    }

    [Fact]
    public void Extract_KeepsFirstDisplayCasing_AndOrder()
    {
        var tags = HashtagParser.Extract("#ĐàLạt and #coffee then #đalat");

        tags.Select(t => (t.Key, t.Display)).Should().Equal(("dalat", "ĐàLạt"), ("coffee", "coffee"));
    }

    [Fact]
    public void Extract_IgnoresTagsLongerThanLimit()
    {
        var tooLong = "#" + new string('a', HashtagParser.MaxTagLength + 1);
        var exact = "#" + new string('b', HashtagParser.MaxTagLength);

        HashtagParser.Extract($"{tooLong} {exact}").Should().ContainSingle().Which.Key.Should().Be(new string('b', 50));
    }

    [Fact]
    public void Extract_CapsDistinctTagsPerPost()
    {
        var content = string.Join(' ', Enumerable.Range(0, HashtagParser.MaxTagsPerPost + 5).Select(i => $"#t{i}"));

        HashtagParser.Extract(content).Should().HaveCount(HashtagParser.MaxTagsPerPost);
    }

    [Fact]
    public void Post_Create_ExtractsHashtags()
    {
        var post = Post.Create(UserId.New(), "Morning #Coffee and #code");

        post.Hashtags.Select(t => t.Key).Should().Equal("coffee", "code");
    }

    [Fact]
    public void Post_UpdateContent_ReplacesHashtags_KeepingSurvivorsAndRefreshingDisplay()
    {
        var author = UserId.New();
        var post = Post.Create(author, "#keep #drop");

        post.UpdateContent(author, "#Keep #added");

        post.Hashtags.Select(t => (t.Key, t.Display)).Should().Equal(("keep", "Keep"), ("added", "added"));
    }

    [Fact]
    public void Post_UpdateContent_WithoutTags_ClearsHashtags()
    {
        var author = UserId.New();
        var post = Post.Create(author, "#gone");

        post.UpdateContent(author, "plain text");

        post.Hashtags.Should().BeEmpty();
    }
}
