using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Identities;
using YSocial.Application.Features.Identities.Login;
using YSocial.Application.Features.Identities.LogoutUser;
using YSocial.Application.Features.Identities.RegisterAccount;

namespace YSocial.Api.Controllers;

public class IdentitiesController : ApiController
{
    private readonly ILogger<IdentitiesController> _logger;

    public IdentitiesController(ILogger<IdentitiesController> logger)
    {
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<IActionResult> RegisterAccount([FromBody] RegisterAccountRequest request)
    {
        var command = new RegisterAccountCommand(request.Email, request.Password);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var command = new LoginCommand(request.Email, request.Password, request.DeviceId);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request)
    {
        var command = new LogoutUserCommand(request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
