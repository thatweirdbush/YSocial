using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.RestoreComment;

public sealed record RestoreCommentCommand(Guid CommentId) : ResultCommand;

internal sealed class RestoreCommentCommandValidator : AbstractValidator<RestoreCommentCommand>
{
    public RestoreCommentCommandValidator()
    {
        RuleFor(x => x.CommentId).NotEmpty();
    }
}

internal sealed class RestoreCommentCommandHandler(
    ICommentRepository commentRepository,
    IPostRepository postRepository,
    InteractionGuard guard,
    IUserContext userContext)
    : ICommandHandler<RestoreCommentCommand, Result>
{
    public async Task<Result> Handle(RestoreCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var commentId = new CommentId(command.CommentId);
        var comment = await commentRepository.GetByIdAsync(commentId, includeDeleted: true, cancellationToken);

        if (comment is null)
        {
            return Result.NotFound($"Comment with ID {command.CommentId} not found.");
        }

        // We also need the post to check if the user is the post owner
        var post = await postRepository.GetByIdAsync(comment.PostId, includeDeleted: true, cancellationToken);
        if (post is null)
        {
            return Result.NotFound("Associated post not found.");
        }

        var editorId = new UserId(userContext.UserId);
        if (await guard.IsCommentHiddenFromAsync(editorId, comment, post, cancellationToken))
        {
            return Result.NotFound("Comment not found.");
        }

        comment.Restore(editorId, post.AuthorId, post.IsDeleted);
        commentRepository.Update(comment);

        return Result.Success();
    }
}
