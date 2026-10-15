using Microsoft.AspNetCore.Authorization;
using YSocial.Api.Models.UserRelations;
using YSocial.Application.Features.UserRelations.RespondFollowRequest;
using YSocial.Application.Features.UserRelations.SetMute;
using YSocial.Application.Features.UserRelations.ToggleCloseFriend;
using YSocial.Application.Features.UserRelations.Unfollow;

namespace YSocial.Api.Controllers;

[Route("api/users/{targetId:guid}/relations")]
[Authorize]
public class UserRelationsController : ApiController
{
    [HttpPost("follow")]
    [ProducesResponseType(typeof(FollowUserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> FollowUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new FollowUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete("follow")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UnfollowUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new UnfollowUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpPatch("close-friend")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ToggleCloseFriend(Guid targetId, [FromBody] ToggleCloseFriendRequest request, CancellationToken cancellationToken)
    {
        var command = new ToggleCloseFriendCommand(targetId, request.IsCloseFriend);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    /// <summary>
    /// Mute the target (idempotent, no body). Never changes the follow state; without an edge a hidden <c>None</c> edge is created
    /// </summary>
    [HttpPut("mute")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MuteUser(Guid targetId, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetMuteCommand(targetId, Muted: true), cancellationToken));

    /// <summary>
    /// Unmute the target (idempotent, no body)
    /// </summary>
    [HttpDelete("mute")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UnmuteUser(Guid targetId, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetMuteCommand(targetId, Muted: false), cancellationToken));

    /// <summary>
    /// Accept or decline the pending follow request of <c>targetId</c> (the requester) addressed to the caller
    /// </summary>
    [HttpPost("follow-request")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RespondFollowRequest(Guid targetId, [FromBody] RespondFollowRequestRequest request, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new RespondFollowRequestCommand(targetId, request.Decision), cancellationToken));
}
