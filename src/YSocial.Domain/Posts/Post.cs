using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Posts.Events;
using YSocial.Domain.Posts.Rules;

namespace YSocial.Domain.Posts;

public class Post : AggregateRoot<PostId>
{
    public UserId AuthorId { get; private set; }
    public string Content { get; private set; } = string.Empty;
    public string? ImageUrl { get; private set; }
    public DateTime CreatedAt { get; private set; } = DateTime.UtcNow;
    public bool IsDeleted { get; private set; }

    private Post(UserId authorId, string content)
    {
        Id = PostId.New();
        AuthorId = authorId;
        Content = content;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
    }

    public static Post Create(UserId authorId, string content)
    {
        CheckRule(new PostContentMustNotBeEmptyRule(content));
        CheckRule(new PostContentLengthLimitRule(content));

        var post = new Post(authorId, content);

        // Send event for Notification or Newsfeed handler
        post.AddDomainEvent(new PostCreatedEvent(post.Id, post.AuthorId));

        return post;
    }

    public void UpdateContent(string newContent)
    {
        CheckRule(new PostContentMustNotBeEmptyRule(newContent));
        CheckRule(new PostContentLengthLimitRule(newContent));

        Content = newContent;

        // Send PostUpdatedEvent here
    }
}
