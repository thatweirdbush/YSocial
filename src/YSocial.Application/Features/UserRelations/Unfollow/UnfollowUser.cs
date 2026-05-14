using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.Unfollow;

public sealed record UnfollowUserCommand(Guid TargetId) : ResultCommand;

internal sealed class UnfollowUserCommandValidator : AbstractValidator<UnfollowUserCommand>
{
    public UnfollowUserCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class UnfollowUserCommandHandler(
    IUserContext userContext,
    UserRelationManager relationManager)
    : ICommandHandler<UnfollowUserCommand, Result>
{
    public async Task<Result> Handle(UnfollowUserCommand request, CancellationToken cancellationToken)
    {
        var observerId = new UserId(userContext.UserId);
        var targetId = new UserId(request.TargetId);

        await relationManager.UnfollowUserAsync(observerId, targetId, cancellationToken);

        return Result.Success();
    }
}
