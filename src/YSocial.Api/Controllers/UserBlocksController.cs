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
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> BlockUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new BlockUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UnblockUser(Guid targetId, CancellationToken cancellationToken)
    {
        var command = new UnblockUserCommand(targetId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
