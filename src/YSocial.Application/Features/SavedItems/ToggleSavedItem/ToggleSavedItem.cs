using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.SavedItems.ToggleSavedItem;

public sealed record ToggleSavedItemResponse(bool IsSaved);

public sealed record ToggleSavedItemCommand(Guid TargetId, SavedItemTargetType TargetType) : ResultCommand<ToggleSavedItemResponse>;

internal sealed class ToggleSavedItemCommandValidator : AbstractValidator<ToggleSavedItemCommand>
{
    public ToggleSavedItemCommandValidator()
    {
        RuleFor(x => x.TargetId)
            .NotEmpty();

        RuleFor(x => x.TargetType)
            .NotNull();
    }
}

internal sealed class ToggleSavedItemCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    ISavedItemRepository savedItemRepository,
    SavedItemToggleService savedItemToggleService,
    IUserContext userContext)
    : ICommandHandler<ToggleSavedItemCommand, Result<ToggleSavedItemResponse>>
{
    public async Task<Result<ToggleSavedItemResponse>> Handle(ToggleSavedItemCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<ToggleSavedItemResponse>.Unauthorized();
        }

        var userId = new UserId(userContext.UserId);

        // Check if target exists
        var targetExists = await request.TargetType.CheckExistsAsync(request.TargetId, postRepository, commentRepository, cancellationToken);
        if (!targetExists)
        {
            return Result<ToggleSavedItemResponse>.NotFound("Target not found.");
        }

        // Check if saved item already exists
        var existingSavedItem = await savedItemRepository.GetByUserAndTargetAsync(userId, request.TargetId, request.TargetType, cancellationToken);

        var toggleResult = savedItemToggleService.ToggleSavedItem(existingSavedItem, request.TargetId, request.TargetType, userId);

        if (toggleResult.Action == SavedItemStatus.Unsaved)
        {
            toggleResult.SavedItem.Remove(); // Fire SavedItemRemovedEvent
            savedItemRepository.Remove(toggleResult.SavedItem);
        }
        else
        {
            await savedItemRepository.AddAsync(toggleResult.SavedItem, cancellationToken);
        }

        return Result<ToggleSavedItemResponse>.Success(new ToggleSavedItemResponse(toggleResult.Action == SavedItemStatus.Saved));
    }
}
