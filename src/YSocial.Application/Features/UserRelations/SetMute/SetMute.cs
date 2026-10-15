using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.UserRelations;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.SetMute;

/// <summary>
/// Idempotent mute flag on the viewer's edge to the target. Muting never changes the follow state:
/// without an edge a <c>None</c> edge is created, a soft-deleted edge stays deleted (flag is dormant).
/// Unmuting always succeeds (also for users that became hidden since).
/// </summary>
public sealed record SetMuteCommand(Guid TargetId, bool Muted) : ResultCommand;

internal sealed class SetMuteCommandValidator : AbstractValidator<SetMuteCommand>
{
    public SetMuteCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class SetMuteCommandHandler(
    IUserContext userContext,
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy)
    : ICommandHandler<SetMuteCommand, Result>
{
    public async Task<Result> Handle(SetMuteCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } observerId)
        {
            return Result.Unauthorized();
        }

        var targetId = new UserId(request.TargetId);
        var edge = await relationRepository.GetRelationAsync(observerId, targetId, includeDeleted: true, cancellationToken);

        if (!request.Muted)
        {
            if (edge is not null)
            {
                edge.SetMuted(false);
                relationRepository.Update(edge);
            }

            return Result.Success();
        }

        UserRelationManager.EnsureCanMute(observerId, targetId);

        var target = await userRepository.GetByIdAsync(targetId, cancellationToken);
        var context = await accessPolicy.GetContextAsync(observerId, [targetId], cancellationToken);
        if (target is null || !context.IsUserAccessible(target))
        {
            return Result.NotFound("Resource not found.");
        }

        if (edge is null)
        {
            edge = UserRelation.Create(observerId, targetId);
            await relationRepository.AddAsync(edge, cancellationToken);
        }

        edge.SetMuted(true);
        relationRepository.Update(edge);

        return Result.Success();
    }
}
