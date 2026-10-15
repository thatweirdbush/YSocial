using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Comments.Rules;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments;

public class CommentPostingService
{
    public Comment CreateComment(Post post, UserId authorId, string content, Comment? parentComment = null)
    {
        Entity.CheckRule(new PostMustAllowCommentsRule(post));
        Entity.CheckRule(new ParentCommentMustBelongToPostRule(post.Id, parentComment));

        // Future extensions:
        // AggregateRoot.CheckRule(new UserMustNotBeBlockedRule(post.AuthorId, authorId));

        return Comment.Create(post.Id, authorId, content, parentComment?.Id);
    }
}
