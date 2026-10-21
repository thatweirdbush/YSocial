namespace YSocial.Domain.Posts;

/// <summary>
/// Hashtag of a post: <see cref="Key"/> = folded match key, <see cref="Display"/> = casing used in the post.
/// Child row of <see cref="Post"/> (owned), identified by (post, key).
/// </summary>
public sealed class PostHashtag
{
    public string Key { get; private set; }
    public string Display { get; private set; }

    private PostHashtag(string key, string display)
    {
        Key = key;
        Display = display;
    }

    public static PostHashtag Create(string key, string display) => new(key, display);

    internal void Rename(string display) => Display = display;
}
