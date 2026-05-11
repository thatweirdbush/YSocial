using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Users;
using YSocial.Application.Features.Users.DeleteProfile;
using YSocial.Application.Features.Users.SetDefaultProfile;
using YSocial.Application.Features.Users.SwitchProfile;
using YSocial.Application.Features.Users.UpdateProfile;

namespace YSocial.Api.Controllers;

public class UsersController : ApiController
{
    [HttpPut("profiles/switch")]
    public async Task<IActionResult> SwitchProfile([FromBody] SwitchProfileRequest request)
    {
        var command = new SwitchProfileCommand(request.ProfileId, request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("profiles/me")]
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
    public async Task<IActionResult> SetDefaultProfile(Guid id)
    {
        var command = new SetDefaultProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("profiles/{id:guid}")]
    public async Task<IActionResult> DeleteProfile(Guid id)
    {
        var command = new DeleteProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
