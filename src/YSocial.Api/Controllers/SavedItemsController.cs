using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.SavedItems;
using YSocial.Application.Features.SavedItems.GetSavedPosts;
using YSocial.Application.Features.SavedItems.SetSavedItem;
using YSocial.Application.Features.SavedItems.ToggleSavedItem;
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
    public async Task<IActionResult> BookmarkPost(Guid id)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Post, true)));

    [HttpDelete("/api/posts/{id:guid}/bookmark")]
    public async Task<IActionResult> UnbookmarkPost(Guid id)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Post, false)));

    [HttpPut("/api/comments/{id:guid}/bookmark")]
    public async Task<IActionResult> BookmarkComment(Guid id)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Comment, true)));

    [HttpDelete("/api/comments/{id:guid}/bookmark")]
    public async Task<IActionResult> UnbookmarkComment(Guid id)
        => HandleResult(await Mediator.Send(new SetSavedItemCommand(id, SavedItemTargetType.Comment, false)));

    #endregion

    [HttpPost("toggle")]
    public async Task<IActionResult> ToggleSavedItem([FromBody] ToggleSavedItemRequest request)
    {
        if (request.TargetType is null) return ValidationProblemFor(nameof(request.TargetType), "Invalid TargetType.");

        var command = new ToggleSavedItemCommand(request.TargetId, request.TargetType);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpGet("posts")]
    public async Task<IActionResult> GetSavedPosts()
    {
        var query = new GetSavedPostsQuery();

        var result = await Mediator.Send(query);

        return HandleResult(result);
    }
}
