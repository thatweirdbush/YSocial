using YSocial.Api.Models.Likes;
using YSocial.Application.Features.Likes.SetLike;
using YSocial.Domain.Likes;

namespace YSocial.Api.Controllers;

public class LikesController : ApiController
{
    private readonly ILogger<LikesController> _logger;

    public LikesController(ILogger<LikesController> logger)
    {
        _logger = logger;
    }

    #region Idempotent routes (D10): absolute templates, no bodies

    [HttpPut("/api/posts/{id:guid}/like")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> LikePost(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetLikeCommand(id, LikeTargetType.Post, true), cancellationToken));

    [HttpDelete("/api/posts/{id:guid}/like")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UnlikePost(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetLikeCommand(id, LikeTargetType.Post, false), cancellationToken));

    [HttpPut("/api/comments/{id:guid}/like")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> LikeComment(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetLikeCommand(id, LikeTargetType.Comment, true), cancellationToken));

    [HttpDelete("/api/comments/{id:guid}/like")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UnlikeComment(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new SetLikeCommand(id, LikeTargetType.Comment, false), cancellationToken));

    #endregion

    [HttpPost("toggle")]
    [ProducesResponseType(typeof(ToggleLikeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleLike([FromBody] ToggleLikeRequest request, CancellationToken cancellationToken)
    {
        if (request.TargetType is null) return ValidationProblemFor(nameof(request.TargetType), "Invalid TargetType.");

        var command = new ToggleLikeCommand(request.TargetId, request.TargetType);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
