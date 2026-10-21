using Microsoft.AspNetCore.Authorization;
using YSocial.Api.Models.Users;
using YSocial.Application.Features.UserBlocks.GetBlocks;
using YSocial.Application.Features.UserRelations.GetFollowList;
using YSocial.Application.Features.UserRelations.GetFollowRequests;
using YSocial.Application.Features.UserRelations.GetMutes;
using YSocial.Application.Features.UserRelations.GetRelationSets;
using YSocial.Application.Features.Users.DeleteProfile;
using YSocial.Application.Features.Users.GetMe;
using YSocial.Application.Features.Users.GetSuggestedUsers;
using YSocial.Application.Features.Users.GetUserProfile;
using YSocial.Application.Features.Users.SetDefaultProfile;
using YSocial.Application.Features.Users.SwitchProfile;
using YSocial.Application.Features.Users.UpdatePrivacy;
using YSocial.Application.Features.Users.UpdateProfile;

namespace YSocial.Api.Controllers;

public class UsersController : ApiController
{
    /// <summary>
    /// Viewer bootstrap: active profile, account email & profile switcher (owner only)
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(MeDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetMe(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetMeQuery(), cancellationToken));

    /// <summary>
    /// Public profile by id (anonymous allowed); blocked/deleted/unknown = 404
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProfileById(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetUserProfileByIdQuery(id), cancellationToken));

    /// <summary>
    /// Public profile by username (case-insensitive, anonymous allowed)
    /// </summary>
    [HttpGet("by-username/{username}")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProfileByUsername(string username, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetUserProfileByUsernameQuery(username), cancellationToken));

    /// <summary>
    /// Pending follow requests addressed to the caller, newest first (search by username or display name)
    /// </summary>
    [HttpGet("me/follow-requests")]
    [Authorize]
    [ProducesResponseType(typeof(FollowListPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetFollowRequests([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetFollowRequestsQuery(page, pageSize, query), cancellationToken));

    /// <summary>
    /// Number of pending follow requests (same access filter as the list)
    /// </summary>
    [HttpGet("me/follow-requests/count")]
    [Authorize]
    [ProducesResponseType(typeof(FollowRequestCountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetFollowRequestCount(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetFollowRequestCountQuery(), cancellationToken));

    /// <summary>
    /// Accepted followers of a user, newest first (anonymous allowed); private and not permitted = 200 locked; blocked/deleted = 404
    /// </summary>
    [HttpGet("{id:guid}/followers")]
    [ProducesResponseType(typeof(FollowListPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetFollowers(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetFollowListQuery(id, Followers: true, page, pageSize, query), cancellationToken));

    /// <summary>
    /// Accepted followees of a user, newest first (same rules as followers)
    /// </summary>
    [HttpGet("{id:guid}/following")]
    [ProducesResponseType(typeof(FollowListPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetFollowing(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetFollowListQuery(id, Followers: false, page, pageSize, query), cancellationToken));

    /// <summary>
    /// Own blocked, muted and close-friend id sets, privacy flag and pending request count
    /// </summary>
    [HttpGet("me/relation-sets")]
    [Authorize]
    [ProducesResponseType(typeof(RelationSetsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetRelationSets(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetRelationSetsQuery(), cancellationToken));

    /// <summary>
    /// Who to follow: mutual followees first, then popularity (anonymous allowed: popularity only)
    /// </summary>
    [HttpGet("suggestions")]
    [ProducesResponseType(typeof(PagedResponse<UserProfileDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetSuggestions([FromQuery] int page = 1, [FromQuery] int pageSize = GetSuggestedUsersQuery.DefaultPageSize, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetSuggestedUsersQuery(page, pageSize), cancellationToken));

    /// <summary>
    /// Own block list, newest block first (items carry isBlocked: true; search by username or display name)
    /// </summary>
    [HttpGet("me/blocks")]
    [Authorize]
    [ProducesResponseType(typeof(PagedResponse<UserProfileDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetBlocks([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetBlocksQuery(page, pageSize, query), cancellationToken));

    /// <summary>
    /// Own muted users, newest mute first (search by username or display name)
    /// </summary>
    [HttpGet("me/mutes")]
    [Authorize]
    [ProducesResponseType(typeof(PagedResponse<UserProfileDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetMutes([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetMutesQuery(page, pageSize, query), cancellationToken));

    /// <summary>
    /// Switch the private-account flag; going public accepts the pending requests
    /// </summary>
    [HttpPut("profiles/me/privacy")]
    [Authorize]
    [ProducesResponseType(typeof(PrivacyUpdatedDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdatePrivacy([FromBody] UpdatePrivacyRequest request, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new UpdatePrivacyCommand(request.IsPrivate), cancellationToken));

    [HttpPut("profiles/switch")]
    [Authorize]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SwitchProfile([FromBody] SwitchProfileRequest request, CancellationToken cancellationToken)
    {
        var command = new SwitchProfileCommand(request.ProfileId, request.RefreshToken);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpPut("profiles/me")]
    [Authorize]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateProfileCommand(
            request.DisplayName,
            request.Bio,
            request.AvatarUrl,
            request.CoverUrl,
            request.Gender,
            request.DateOfBirth);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpPatch("profiles/{id:guid}/default")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetDefaultProfile(Guid id, CancellationToken cancellationToken)
    {
        var command = new SetDefaultProfileCommand(id);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete("profiles/{id:guid}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteProfile(Guid id, CancellationToken cancellationToken)
    {
        var command = new DeleteProfileCommand(id);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
