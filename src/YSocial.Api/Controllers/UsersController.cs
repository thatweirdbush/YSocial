using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Users;
using YSocial.Application.Features.Users.DeleteProfile;
using YSocial.Application.Features.Users.GetMe;
using YSocial.Application.Features.Users.GetUserProfile;
using YSocial.Application.Features.Users.SetDefaultProfile;
using YSocial.Application.Features.Users.SwitchProfile;
using YSocial.Application.Features.Users.UpdateProfile;

namespace YSocial.Api.Controllers;

public class UsersController : ApiController
{
    /// <summary>
    /// Viewer bootstrap: active profile, account email & profile switcher (owner only)
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMe()
        => HandleResult(await Mediator.Send(new GetMeQuery()));

    /// <summary>
    /// Public profile by id (anonymous allowed); blocked/deleted/unknown = 404
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetProfileById(Guid id)
        => HandleResult(await Mediator.Send(new GetUserProfileByIdQuery(id)));

    /// <summary>
    /// Public profile by username (case-insensitive, anonymous allowed)
    /// </summary>
    [HttpGet("by-username/{username}")]
    public async Task<IActionResult> GetProfileByUsername(string username)
        => HandleResult(await Mediator.Send(new GetUserProfileByUsernameQuery(username)));

    [HttpPut("profiles/switch")]
    [Authorize]
    public async Task<IActionResult> SwitchProfile([FromBody] SwitchProfileRequest request)
    {
        var command = new SwitchProfileCommand(request.ProfileId, request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("profiles/me")]
    [Authorize]
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
    public async Task<IActionResult> SetDefaultProfile(Guid id)
    {
        var command = new SetDefaultProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("profiles/{id:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteProfile(Guid id)
    {
        var command = new DeleteProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
