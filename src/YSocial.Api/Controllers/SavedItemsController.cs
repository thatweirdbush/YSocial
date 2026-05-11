using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.SavedItems;
using YSocial.Application.Features.SavedItems.GetSavedPosts;
using YSocial.Application.Features.SavedItems.ToggleSavedItem;

namespace YSocial.Api.Controllers;

public class SavedItemsController : ApiController
{
    private readonly ILogger<SavedItemsController> _logger;

    public SavedItemsController(ILogger<SavedItemsController> logger)
    {
        _logger = logger;
    }

    [HttpPost("toggle")]
    public async Task<IActionResult> ToggleSavedItem([FromBody] ToggleSavedItemRequest request)
    {
        if (request.TargetType is null) return BadRequest("Invalid TargetType");

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
