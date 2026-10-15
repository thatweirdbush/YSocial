using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Application.Features.UserBlocks.Block;
using YSocial.Application.Features.UserBlocks.Unblock;

namespace YSocial.Api.Controllers;

[Route("api/users/{targetId:guid}/blocks")]
[Authorize]
public class UserBlocksController : ApiController
{
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> BlockUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new BlockUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UnblockUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new UnblockUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
