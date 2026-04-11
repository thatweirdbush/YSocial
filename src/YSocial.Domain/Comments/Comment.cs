using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Comments.Events;
using YSocial.Domain.Comments.Rules;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments;

public class Comment : AggregateRoot<CommentId>
{
    public PostId PostId { get; private set; }
    public UserId AuthorId { get; private set; }
    public string Content { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }
    public CommentId? ParentCommentId { get; private set; }
    public bool IsDeleted { get; private set; }

    private Comment(PostId postId, UserId authorId, string content, CommentId? parentCommentId)
    {
        Id = CommentId.New();
        PostId = postId;
        AuthorId = authorId;
        Content = content;
        ParentCommentId = parentCommentId;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
    }

    public static Comment Create(PostId postId, UserId authorId, string content, CommentId? parentCommentId = null)
    {
        CheckRule(new CommentContentMustNotBeEmptyRule(content));
        CheckRule(new CommentContentLengthLimitRule(content));

        var comment = new Comment(postId, authorId, content, parentCommentId);
        comment.AddDomainEvent(new CommentCreatedEvent(comment.Id, postId, authorId));

        return comment;
    }

    public void UpdateContent(string newContent)
    {
        CheckRule(new CommentContentMustNotBeEmptyRule(newContent));
        CheckRule(new CommentContentLengthLimitRule(newContent));

        Content = newContent;
        UpdatedAt = DateTime.UtcNow;

        AddDomainEvent(new CommentUpdatedEvent(Id));
    }

    public void Delete()
    {
        IsDeleted = true;
        AddDomainEvent(new CommentDeletedEvent(Id));
    }
}
