using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.RestoreComment;

public sealed record RestoreCommentCommand(Guid CommentId) : ResultCommand<bool>;

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
    IUserContext userContext)
    : ICommandHandler<RestoreCommentCommand, Result<bool>>
{
    public async Task<Result<bool>> Handle(RestoreCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<bool>.Unauthorized();
        }

        var commentId = new CommentId(command.CommentId);
        var comment = await commentRepository.GetByIdAsync(commentId, includeDeleted: true, cancellationToken);

        if (comment is null)
        {
            return Result<bool>.NotFound($"Comment with ID {command.CommentId} not found.");
        }

        // We also need the post to check if the user is the post owner
        var post = await postRepository.GetByIdAsync(comment.PostId, includeDeleted: true, cancellationToken);
        if (post is null)
        {
            return Result<bool>.NotFound("Associated post not found.");
        }

        var editorId = new UserId(userContext.UserId);
        comment.Restore(editorId, post.AuthorId, post.IsDeleted);
        commentRepository.Update(comment);

        return Result<bool>.Success(true);
    }
}
