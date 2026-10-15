using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.DeleteComment;

public sealed record DeleteCommentCommand(Guid CommentId) : ResultCommand;

internal sealed class DeleteCommentCommandValidator : AbstractValidator<DeleteCommentCommand>
{
    public DeleteCommentCommandValidator()
    {
        RuleFor(x => x.CommentId).NotEmpty();
    }
}

internal sealed class DeleteCommentCommandHandler(
    ICommentRepository commentRepository, 
    IPostRepository postRepository,
    IUserContext userContext)
    : ICommandHandler<DeleteCommentCommand, Result>
{
    public async Task<Result> Handle(DeleteCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var commentId = new CommentId(command.CommentId);
        var comment = await commentRepository.GetByIdAsync(commentId, cancellationToken);

        if (comment is null)
        {
            return Result.NotFound($"Comment with ID {command.CommentId} not found.");
        }

        var post = await postRepository.GetByIdAsync(comment.PostId, cancellationToken);
        if (post is null)
        {
            return Result.NotFound("Associated post not found.");
        }

        var editorId = new UserId(userContext.UserId);
        comment.Delete(editorId, post.AuthorId);
        commentRepository.Remove(comment);

        return Result.Success();
    }
}
