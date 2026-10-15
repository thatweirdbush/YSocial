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

    public static Post Create(UserId authorId, string content, string? imageUrl = null, PostVisibility? visibility = null, bool allowComments = true)
    {
        visibility ??= PostVisibility.Public;

        CheckRule(new PostContentMustNotBeEmptyRule(content));
        CheckRule(new PostContentLengthLimitRule(content));

        var post = new Post(authorId, content, imageUrl, visibility, allowComments);

        post.AddDomainEvent(new PostCreatedEvent(post.Id, post.AuthorId));

        return post;
    }

    public void UpdateContent(UserId editorId, string newContent)
    {
        CheckRule(new OnlyAuthorCanPerformActionOnPostRule(AuthorId, editorId));
        CheckRule(new PostContentMustNotBeEmptyRule(newContent));
        CheckRule(new PostContentLengthLimitRule(newContent));

        Content = newContent;
        UpdatedAt = DateTime.UtcNow;

        AddDomainEvent(new PostUpdatedEvent(Id));
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
