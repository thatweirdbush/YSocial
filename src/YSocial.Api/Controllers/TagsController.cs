using YSocial.Application.Features.Discovery.GetPostsByTag;
using YSocial.Application.Models.Commons;

namespace YSocial.Api.Controllers;

public class TagsController : ApiController
{
    /// <summary>
    /// Root posts carrying the tag (folded match, leading <c>#</c> optional), <c>latest</c> (default) or <c>top</c>. Unknown tag = empty page. Anonymous allowed
    /// </summary>
    [HttpGet("{tag}/posts")]
    [ProducesResponseType(typeof(TagPostsPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetPostsByTag(
        string tag,
        [FromQuery] string sort = GetPostsByTagQuery.Latest,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetPostsByTagQuery(tag, sort, page, pageSize), cancellationToken));
}
