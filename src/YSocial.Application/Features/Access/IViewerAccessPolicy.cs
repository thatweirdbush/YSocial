using YSocial.Domain.Users;

namespace YSocial.Application.Features.Access;

/// <summary>
/// Single read-side gate (D14, D15, D20): block/privacy/visibility are defined ONLY here.
/// Handlers load a context once per request and filter BEFORE paging & counting; they never re-implement checks.
/// </summary>
public interface IViewerAccessPolicy
{
    /// <summary>
    /// Loads everything needed to judge <paramref name="candidateUserIds"/> for the viewer in one batch
    /// (1 call to each of users, blocks, relations).
    /// </summary>
    /// <param name="viewerId">Profile id (never AccountId); null = anonymous.</param>
    /// <param name="candidateUserIds">Every author/owner the caller is about to expose.</param>
    Task<ViewerAccessContext> GetContextAsync(UserId? viewerId, IReadOnlyCollection<UserId> candidateUserIds, CancellationToken cancellationToken = default);
}
