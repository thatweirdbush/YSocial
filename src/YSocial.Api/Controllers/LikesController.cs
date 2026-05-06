using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Likes;
using YSocial.Application.Features.Likes.ToggleLike;

namespace YSocial.Api.Controllers;

public class LikesController : ApiController
{
    private readonly ILogger<LikesController> _logger;

    public LikesController(ILogger<LikesController> logger)
    {
        _logger = logger;
    }

    [HttpPost("toggle")]
    public async Task<IActionResult> ToggleLike([FromBody] ToggleLikeRequest request)
    {
        var command = new ToggleLikeCommand(request.TargetId, request.TargetType);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
