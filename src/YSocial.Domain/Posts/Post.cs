using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Posts.Events;
using YSocial.Domain.Posts.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts;

public class Post : AggregateRoot<PostId>, ISoftDeletable
{
    public UserId AuthorId { get; private set; }
    public string Content { get; private set; } = string.Empty;
    public string? ImageUrl { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; private set; }
    public PostVisibility Visibility { get; private set; }
    public bool AllowComments { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public int LikeCount { get; private set; }
    public int SavedCount { get; private set; }

    private readonly List<PostHashtag> _hashtags = [];

    /// <summary>
    /// Tags of the content; loaded only by repo members that include them.
    /// </summary>
    public IReadOnlyList<PostHashtag> Hashtags => _hashtags;

    private readonly List<PostMedia> _media = [];

    /// <summary>
    /// Attached media snapshots in display order (immutable after create; always loaded with the post).
    /// </summary>
    public IReadOnlyList<PostMedia> Media => _media;

#pragma warning disable CS8618
    private Post() { }
#pragma warning restore CS8618

    private Post(UserId authorId, string content, string? imageUrl, PostVisibility visibility, bool allowComments)
    {
        Id = PostId.New();
        AuthorId = authorId;
        Content = content;
        ImageUrl = imageUrl;
        Visibility = visibility;
        AllowComments = allowComments;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
        LikeCount = 0;
        SavedCount = 0;
    }

    public static Post Create(
        UserId authorId,
        string content,
        string? imageUrl = null,
        PostVisibility? visibility = null,
        bool allowComments = true,
        IReadOnlyList<PostMedia>? media = null)
    {
        visibility ??= PostVisibility.Public;
        media ??= [];

        CheckRule(new PostContentMustNotBeEmptyRule(content, media.Count > 0 || imageUrl is not null));
        CheckRule(new PostContentLengthLimitRule(content));
        CheckRule(new PostMediaLimitRule(media.Count));

        var post = new Post(authorId, content, imageUrl, visibility, allowComments);
        post.SyncHashtags(content);

        for (var position = 0; position < media.Count; position++)
        {
            media[position].Place(position);
            post._media.Add(media[position]);
        }

        post.AddDomainEvent(new PostCreatedEvent(post.Id, post.AuthorId));

        return post;
    }

    public void UpdateContent(UserId editorId, string newContent)
    {
        CheckRule(new OnlyAuthorCanPerformActionOnPostRule(AuthorId, editorId));
        CheckRule(new PostContentMustNotBeEmptyRule(newContent, _media.Count > 0 || ImageUrl is not null));
        CheckRule(new PostContentLengthLimitRule(newContent));

        Content = newContent;
        UpdatedAt = DateTime.UtcNow;
        SyncHashtags(newContent);

        AddDomainEvent(new PostUpdatedEvent(Id));
    }

    // Keeps surviving rows (display refreshed), drops missing, adds new: same save as the content change
    private void SyncHashtags(string content)
    {
        var wanted = HashtagParser.Extract(content);
        _hashtags.RemoveAll(existing => wanted.All(w => w.Key != existing.Key));

        foreach (var (key, display) in wanted)
        {
            var kept = _hashtags.Find(existing => existing.Key == key);
            if (kept is null) _hashtags.Add(PostHashtag.Create(key, display));
            else kept.Rename(display);
        }
    }

    public void UpdateSettings(PostVisibility visibility, bool allowComments)
    {
        Visibility = visibility;
        AllowComments = allowComments;
        UpdatedAt = DateTime.UtcNow;

        AddDomainEvent(new PostUpdatedEvent(Id));
    }

    public void Delete(UserId editorId)
    {
        CheckRule(new OnlyAuthorCanPerformActionOnPostRule(AuthorId, editorId));

        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        AddDomainEvent(new PostDeletedEvent(Id));
    }

    public void Restore(UserId editorId)
    {
        CheckRule(new OnlyAuthorCanPerformActionOnPostRule(AuthorId, editorId));
        CheckRule(new PostMustBeDeletedToRestoreRule(IsDeleted));

        IsDeleted = false;
        DeletedAt = null;
        AddDomainEvent(new PostRestoredEvent(Id));
    }

    public void IncrementLikeCount()
    {
        LikeCount++;
    }

    public void DecrementLikeCount()
    {
        if (LikeCount > 0)
        {
            LikeCount--;
        }
    }

    public void IncrementSavedCount()
    {
        SavedCount++;
    }

    public void DecrementSavedCount()
    {
        if (SavedCount > 0)
        {
            SavedCount--;
        }
    }
}
