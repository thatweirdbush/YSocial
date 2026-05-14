using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.UserRelations;
using YSocial.Application.Features.UserRelations.Follow;
using YSocial.Application.Features.UserRelations.ToggleCloseFriend;
using YSocial.Application.Features.UserRelations.Unfollow;

namespace YSocial.Api.Controllers;

[Route("api/users/{targetId:guid}/relations")]
[Authorize]
public class UserRelationsController : ApiController
{
    [HttpPost("follow")]
    [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(string))]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> FollowUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new FollowUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete("follow")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UnfollowUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new UnfollowUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpPatch("close-friend")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ToggleCloseFriend(Guid targetId, [FromBody] ToggleCloseFriendRequest request, CancellationToken cancellationToken)
    {
        var command = new ToggleCloseFriendCommand(targetId, request.IsCloseFriend);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
