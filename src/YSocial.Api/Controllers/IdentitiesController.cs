using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Identities;
using YSocial.Application.Features.Identities.DeleteAccount;
using YSocial.Application.Features.Identities.ForgotPassword;
using YSocial.Application.Features.Identities.Login;
using YSocial.Application.Features.Identities.LogoutUser;
using YSocial.Application.Features.Identities.RefreshToken;
using YSocial.Application.Features.Identities.RegisterAccount;
using YSocial.Application.Features.Identities.ResetPassword;

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
        var command = new RegisterAccountCommand(request.Email, request.Password, request.Username, request.PhoneNumber);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var command = new LoginCommand(request.LoginId, request.Password, request.DeviceId);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    /// <summary>
    /// Silent refresh: exchanges a refresh token for a new access + refresh pair (anonymous).
    /// </summary>
    [HttpPost("refresh-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var command = new RefreshTokenCommand(request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request)
    {
        var command = new LogoutUserCommand(request.RefreshToken);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var command = new ForgotPasswordCommand(request.LoginId);

        var result = await Mediator.Send(command);
        
        return HandleResult(result);
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var command = new ResetPasswordCommand(request.LoginId, request.Otp, request.NewPassword);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var command = new DeleteAccountCommand();

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
