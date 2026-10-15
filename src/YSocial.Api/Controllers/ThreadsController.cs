using Microsoft.AspNetCore.Mvc;
using YSocial.Application.Features.Threads.GetThread;

namespace YSocial.Api.Controllers;

public class ThreadsController : ApiController
{
    /// <summary>
    /// Thread of a post or comment id (anonymous allowed); deleted/hidden/blocked = 404
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetThread(Guid id)
        => HandleResult(await Mediator.Send(new GetThreadQuery(id)));
}
