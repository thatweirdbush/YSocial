using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.SavedItems.SetSavedItem;

/// <summary>
/// Idempotent bookmark state (D10): no-op when the target is already in the requested state.
/// </summary>
public sealed record SetSavedItemCommand(Guid TargetId, SavedItemTargetType TargetType, bool Saved) : ResultCommand;

internal sealed class SetSavedItemCommandValidator : AbstractValidator<SetSavedItemCommand>
{
    public SetSavedItemCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class SetSavedItemCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    ISavedItemRepository savedItemRepository,
    SavedItemToggleService savedItemToggleService,
    InteractionGuard interactionGuard,
    IUserContext userContext)
    : ICommandHandler<SetSavedItemCommand, Result>
{
    public async Task<Result> Handle(SetSavedItemCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var userId = new UserId(userContext.UserId);

        if (!await request.TargetType.CheckExistsAsync(request.TargetId, postRepository, commentRepository, cancellationToken))
        {
            return Result.NotFound("Target not found.");
        }

        if (!await interactionGuard.CanInteractAsync(userId, request.TargetId, request.TargetType == SavedItemTargetType.Comment, cancellationToken))
        {
            return Result.NotFound("Target not found.");
        }

        var existing = await savedItemRepository.GetByUserAndTargetAsync(userId, request.TargetId, request.TargetType, cancellationToken);
        if ((existing is not null) == request.Saved)
        {
            return Result.Success();
        }

        var toggleResult = savedItemToggleService.ToggleSavedItem(existing, request.TargetId, request.TargetType, userId);

        if (toggleResult.Action == SavedItemStatus.Unsaved)
        {
            toggleResult.SavedItem.Remove();
            savedItemRepository.Remove(toggleResult.SavedItem);
        }
        else
        {
            await savedItemRepository.AddAsync(toggleResult.SavedItem, cancellationToken);
        }

        return Result.Success();
    }
}
