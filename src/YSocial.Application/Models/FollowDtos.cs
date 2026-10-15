using YSocial.Application.Models.Commons;

namespace YSocial.Application.Models;

/// <summary>
/// Follow list / follow requests page. <see cref="Locked"/> = private profile the viewer may not open
/// (empty items, <c>totalCount</c> 0); always false for the viewer's own follow requests.
/// </summary>
public sealed record FollowListPageDto(IReadOnlyList<UserProfileDto> Items, int Page, int PageSize, int TotalCount, bool Locked)
    : PagedResponse<UserProfileDto>(Items, Page, PageSize, TotalCount);

public sealed record FollowRequestCountDto(int Count);

/// <summary>
/// Result of switching the privacy setting: pending requests accepted by going public.
/// </summary>
public sealed record PrivacyUpdatedDto(int AcceptedCount);

/// <summary>
/// Viewer's own relation id sets (no <c>blockedBy</c>, D14). Close-friend and muted flags include dormant ones (edge unfollowed).
/// </summary>
public sealed record RelationSetsDto(
    IReadOnlyList<Guid> Blocked,
    IReadOnlyList<Guid> Muted,
    IReadOnlyList<Guid> CloseFriends,
    bool IsPrivate,
    int RequestCount);
