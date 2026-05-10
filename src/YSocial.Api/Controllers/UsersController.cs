using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Users;
using YSocial.Application.Features.Users.DeleteProfile;
using YSocial.Application.Features.Users.SwitchProfile;

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

    [HttpDelete("profiles/{id:guid}")]
    public async Task<IActionResult> DeleteProfile(Guid id)
    {
        var command = new DeleteProfileCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
