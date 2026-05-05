using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.UpdateComment;

public sealed record UpdateCommentCommand(Guid CommentId, string Content) : ResultCommand<bool>;

internal sealed class UpdateCommentCommandValidator : AbstractValidator<UpdateCommentCommand>
{
    public UpdateCommentCommandValidator()
    {
        RuleFor(x => x.CommentId)
            .NotEmpty();

        RuleFor(x => x.Content)
            .NotNull()
            .NotEmpty();
    }
}

internal sealed class UpdateCommentCommandHandler(
    ICommentRepository commentRepository, 
    IUserContext userContext)
    : ICommandHandler<UpdateCommentCommand, Result<bool>>
{
    public async Task<Result<bool>> Handle(UpdateCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<bool>.Unauthorized();
        }

        var commentId = new CommentId(command.CommentId);
        var comment = await commentRepository.GetByIdAsync(commentId, cancellationToken);

        if (comment is null)
        {
            return Result<bool>.NotFound($"Comment with ID {command.CommentId} not found.");
        }

        var editorId = new UserId(userContext.UserId);
        comment.UpdateContent(editorId, command.Content);
        commentRepository.Update(comment);

        return Result<bool>.Success(true);
    }
}
