using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Likes;
using YSocial.Application.Features.Likes.ToggleLike;
using YSocial.Domain.Likes;

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
        var targetType = LikeTargetType.GetAll().FirstOrDefault(x => x.Value == request.TargetType);
        if (targetType is null) return BadRequest("Invalid TargetType");

        var command = new ToggleLikeCommand(request.TargetId, targetType);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
