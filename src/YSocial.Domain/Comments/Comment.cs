using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Comments.Events;
using YSocial.Domain.Comments.Rules;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments;

public class Comment : AggregateRoot<CommentId>, ISoftDeletable
{
    public PostId PostId { get; private set; }
    public UserId AuthorId { get; private set; }
    public string Content { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }
    public CommentId? ParentCommentId { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public UserId? DeletedBy { get; private set; }
    public int LikeCount { get; private set; }
    public int SavedCount { get; private set; }

    private Comment(PostId postId, UserId authorId, string content, CommentId? parentCommentId)
    {
        Id = CommentId.New();
        PostId = postId;
        AuthorId = authorId;
        Content = content;
        ParentCommentId = parentCommentId;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
        LikeCount = 0;
        SavedCount = 0;
    }

    public static Comment Create(PostId postId, UserId authorId, string content, CommentId? parentCommentId = null)
    {
        CheckRule(new CommentContentMustNotBeEmptyRule(content));
        CheckRule(new CommentContentLengthLimitRule(content));

        var comment = new Comment(postId, authorId, content, parentCommentId);
        comment.AddDomainEvent(new CommentCreatedEvent(comment.Id, postId, authorId));

        return comment;
    }

    public void UpdateContent(UserId editorId, string newContent)
    {
        CheckRule(new OnlyAuthorCanEditCommentRule(AuthorId, editorId));
        CheckRule(new CommentContentMustNotBeEmptyRule(newContent));
        CheckRule(new CommentContentLengthLimitRule(newContent));

        Content = newContent;
        UpdatedAt = DateTime.UtcNow;

        AddDomainEvent(new CommentUpdatedEvent(Id));
    }

    public void Delete(UserId editorId, UserId postAuthorId)
    {
        CheckRule(new OnlyAuthorOrPostOwnerCanDeleteCommentRule(AuthorId, postAuthorId, editorId));
        
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        DeletedBy = editorId;
        AddDomainEvent(new CommentDeletedEvent(Id));
    }

    public void Restore(UserId editorId, UserId postAuthorId, bool isPostDeleted)
    {
        CheckRule(new OnlyAuthorOrPostOwnerCanDeleteCommentRule(AuthorId, postAuthorId, editorId));
        CheckRule(new OnlyDeleterCanRestoreCommentRule(DeletedBy, editorId));
        CheckRule(new CommentMustBeDeletedToRestoreRule(IsDeleted));
        CheckRule(new CannotRestoreCommentIfPostIsDeletedRule(isPostDeleted));
        
        IsDeleted = false;
        DeletedAt = null;
        DeletedBy = null;
        AddDomainEvent(new CommentRestoredEvent(Id));
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
