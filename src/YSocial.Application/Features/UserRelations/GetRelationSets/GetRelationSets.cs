using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Application.Features.UserRelations.GetFollowRequests;
using YSocial.Application.Models;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.GetRelationSets;

/// <summary>
/// Own id sets for the relation UI. Close friends and muted include dormant flags (unfollowed edges)
/// but only users still discoverable; <c>blocked</c> is the one exempt set (D14).
/// </summary>
public sealed record GetRelationSetsQuery : ResultQuery<RelationSetsDto>;

internal sealed class GetRelationSetsQueryHandler(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IUserBlockRepository blockRepository,
    IViewerAccessPolicy accessPolicy,
    AccessibleFollowRequests requests,
    IUserContext userContext)
    : IRequestHandler<GetRelationSetsQuery, Result<RelationSetsDto>>
{
    public async Task<Result<RelationSetsDto>> Handle(GetRelationSetsQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<RelationSetsDto>.Unauthorized();
        }

        var edges = await relationRepository.GetByObserverAsync(viewerId, cancellationToken);
        var flagged = edges.Where(e => e.IsCloseFriend || e.IsMuted).Select(e => e.TargetId).Distinct().ToList();
        var context = await accessPolicy.GetContextAsync(viewerId, flagged, cancellationToken);

        var closeFriends = edges.Where(e => e.IsCloseFriend && context.IsDiscoverable(e.TargetId)).Select(e => e.TargetId.Value).ToList();
        var muted = edges.Where(e => e.IsMuted && context.IsDiscoverable(e.TargetId)).Select(e => e.TargetId.Value).ToList();

        var blocked = (await blockRepository.GetByObserverAsync(viewerId, cancellationToken)).Select(b => b.TargetId.Value).ToList();

        var viewer = await userRepository.GetByIdAsync(viewerId, cancellationToken);
        var requestCount = (await requests.LoadAsync(viewerId, cancellationToken)).Count;

        return Result<RelationSetsDto>.Success(new RelationSetsDto(
            blocked,
            muted,
            closeFriends,
            viewer?.PrivacySettings.IsPrivateProfile ?? false,
            requestCount));
    }
}
