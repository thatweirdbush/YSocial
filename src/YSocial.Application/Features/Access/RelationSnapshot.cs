using YSocial.Domain.UserRelations;

namespace YSocial.Application.Features.Access;

/// <summary>
/// Viewer to candidate edge. <see cref="Status"/> is <see cref="FollowStatus.None"/> for soft-deleted edges;
/// flags stay readable (dormant) but never grant access.
/// </summary>
public sealed record RelationSnapshot(FollowStatus Status, bool IsCloseFriend, bool IsMuted);
