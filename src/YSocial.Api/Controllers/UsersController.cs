using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Users;
using YSocial.Application.Features.Users.DeleteProfile;
using YSocial.Application.Features.Users.GetMe;
using YSocial.Application.Features.UserRelations.GetFollowRequests;
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
    public async Task<IActionResult> GetMe()
        => HandleResult(await Mediator.Send(new GetMeQuery()));

    /// <summary>
    /// Public profile by id (anonymous allowed); blocked/deleted/unknown = 404
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProfileById(Guid id)
        => HandleResult(await Mediator.Send(new GetUserProfileByIdQuery(id)));

    /// <summary>
    /// Public profile by username (case-insensitive, anonymous allowed)
    /// </summary>
    [HttpGet("by-username/{username}")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProfileByUsername(string username)
        => HandleResult(await Mediator.Send(new GetUserProfileByUsernameQuery(username)));

    /// <summary>
    /// Pending follow requests addressed to the caller, newest first (search by username or display name)
    /// </summary>
    [HttpGet("me/follow-requests")]
    [Authorize]
    [ProducesResponseType(typeof(FollowListPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetFollowRequests([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? query = null)
        => HandleResult(await Mediator.Send(new GetFollowRequestsQuery(page, pageSize, query)));

    /// <summary>
    /// Number of pending follow requests (same access filter as the list)
    /// </summary>
    [HttpGet("me/follow-requests/count")]
    [Authorize]
    [ProducesResponseType(typeof(FollowRequestCountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetFollowRequestCount()
        => HandleResult(await Mediator.Send(new GetFollowRequestCountQuery()));

    /// <summary>
    /// Switch the private-account flag; going public accepts the pending requests
    /// </summary>
    [HttpPut("profiles/me/privacy")]
    [Authorize]
    [ProducesResponseType(typeof(PrivacyUpdatedDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdatePrivacy([FromBody] UpdatePrivacyRequest request)
        => HandleResult(await Mediator.Send(new UpdatePrivacyCommand(request.IsPrivate)));

    [HttpPut("profiles/switch")]
    [Authorize]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SwitchProfile([FromBody] SwitchProfileRequest request)
    {
        var command = new SwitchProfileCommand(request.ProfileId, request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("profiles/me")]
    [Authorize]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var command = new UpdateProfileCommand(
            request.DisplayName,
            request.Bio,
            request.AvatarUrl,
            request.CoverUrl,
            request.Gender,
            request.DateOfBirth);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPatch("profiles/{id:guid}/default")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetDefaultProfile(Guid id)
    {
        var command = new SetDefaultProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("profiles/{id:guid}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteProfile(Guid id)
    {
        var command = new DeleteProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
