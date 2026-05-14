using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.ToggleCloseFriend;

public sealed record ToggleCloseFriendCommand(Guid TargetId, bool IsCloseFriend) : ResultCommand;

internal sealed class ToggleCloseFriendCommandValidator : AbstractValidator<ToggleCloseFriendCommand>
{
    public ToggleCloseFriendCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class ToggleCloseFriendCommandHandler(
    IUserContext userContext,
    UserRelationManager relationManager)
    : ICommandHandler<ToggleCloseFriendCommand, Result>
{
    public async Task<Result> Handle(ToggleCloseFriendCommand request, CancellationToken cancellationToken)
    {
        var observerId = new UserId(userContext.UserId);
        var targetId = new UserId(request.TargetId);

        await relationManager.ToggleCloseFriendAsync(observerId, targetId, request.IsCloseFriend, cancellationToken);

        return Result.Success();
    }
}
