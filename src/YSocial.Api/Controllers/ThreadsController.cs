using Microsoft.AspNetCore.Mvc;
using YSocial.Application.Features.Threads.GetThread;

namespace YSocial.Api.Controllers;

public class ThreadsController : ApiController
{
    /// <summary>
    /// Thread of a post or comment id (anonymous allowed); deleted/hidden/blocked = 404
    /// </summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ThreadDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetThread(Guid id)
        => HandleResult(await Mediator.Send(new GetThreadQuery(id)));
}
