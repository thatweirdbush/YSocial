using YSocial.Application.Features.SavedItems.GetSavedPosts;
using YSocial.Application.Features.SavedItems.SetSavedItem;
using YSocial.Domain.SavedItems;

namespace YSocial.Api.Controllers;

public class SavedItemsController : ApiController
{
    private readonly ILogger<SavedItemsController> _logger;

    public SavedItemsController(ILogger<SavedItemsController> logger)
    {
        _logger = logger;
    }

    #region Idempotent routes (D10): absolute templates, no bodies

    [HttpPut("/api/posts/{id:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> BookmarkPost(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Post, true), cancellationToken));

    [HttpDelete("/api/posts/{id:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UnbookmarkPost(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Post, false), cancellationToken));

    [HttpPut("/api/comments/{id:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> BookmarkComment(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Comment, true), cancellationToken));

    [HttpDelete("/api/comments/{id:guid}/bookmark")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UnbookmarkComment(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Comment, false), cancellationToken));

    #endregion

    [HttpGet("posts")]
    [ProducesResponseType(typeof(PagedResponse<PostDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetSavedPosts([FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken cancellationToken = default)
    {
        var query = new GetSavedPostsQuery(page, pageSize);

        var result = await Mediator.Send(query, cancellationToken);

        return HandleResult(result);
    }
}
