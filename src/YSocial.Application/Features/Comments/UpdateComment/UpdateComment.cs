using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Comments;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.UpdateComment;

public sealed record UpdateCommentCommand(Guid CommentId, string Content) : ResultCommand<PostDto>;

internal sealed class UpdateCommentCommandValidator : AbstractValidator<UpdateCommentCommand>
{
    public UpdateCommentCommandValidator()
    {
        RuleFor(x => x.CommentId)
            .NotEmpty();

        RuleFor(x => x.Content)
            .NotEmpty();
    }
}

internal sealed class UpdateCommentCommandHandler(
    ICommentRepository commentRepository,
    PostProjector projector,
    IUserContext userContext)
    : ICommandHandler<UpdateCommentCommand, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(UpdateCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PostDto>.Unauthorized();
        }

        var editorId = new UserId(userContext.UserId);
        var comment = await commentRepository.GetByIdAsync(new CommentId(command.CommentId), cancellationToken);

        // Inaccessible comments do not reveal their existence to a non-author editor
        if (comment is null || !(await projector.ProjectAsync(editorId, [], [comment], cancellationToken)).ContainsKey(comment.Id.Value))
        {
            return Result<PostDto>.NotFound("Comment not found.");
        }

        // Domain enforces OnlyAuthorCanEditCommentRule (403 NotCommentAuthor)
        comment.UpdateContent(editorId, command.Content);
        commentRepository.Update(comment);

        var items = await projector.ProjectAsync(editorId, [], [comment], cancellationToken);

        return Result<PostDto>.Success(items[comment.Id.Value]);
    }
}
