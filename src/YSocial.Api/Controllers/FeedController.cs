using YSocial.Application.Features.Feed.GetFeed;
using YSocial.Application.Models.Commons;

namespace YSocial.Api.Controllers;

public class FeedController : ApiController
{
    /// <summary>
    /// Home feed (newest first): <c>forYou</c> (default, anonymous allowed) or <c>following</c> (own posts and accepted followees, authenticated)
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResponse<PostDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetFeed([FromQuery] string tab = GetFeedQuery.ForYou, [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetFeedQuery(tab, page, pageSize), cancellationToken));
}
