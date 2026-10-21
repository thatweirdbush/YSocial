using YSocial.Application.Features.Discovery.GetTrendingTags;
using YSocial.Application.Models;

namespace YSocial.Api.Controllers;

public class TrendingController : ApiController
{
    /// <summary>
    /// Most used tags among posts the viewer may see (7 days, widened to 30 then 365 until <c>limit</c> tags exist). Anonymous allowed
    /// </summary>
    [HttpGet("tags")]
    [ProducesResponseType(typeof(IReadOnlyList<TrendingTagDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetTrendingTags([FromQuery] int limit = GetTrendingTagsQuery.DefaultLimit, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetTrendingTagsQuery(limit), cancellationToken));
}
