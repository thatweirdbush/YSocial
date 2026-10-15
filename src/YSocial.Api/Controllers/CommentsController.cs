using YSocial.Api.Models.Comments;
using YSocial.Application.Features.Comments.AddComment;
using YSocial.Application.Features.Comments.DeleteComment;
using YSocial.Application.Features.Comments.RestoreComment;
using YSocial.Application.Features.Comments.UpdateComment;

namespace YSocial.Api.Controllers;

public class CommentsController : ApiController
{
    private readonly ILogger<CommentsController> _logger;

    public CommentsController(ILogger<CommentsController> logger)
    {
        _logger = logger;
    }

    [HttpPost]
    [ProducesResponseType(typeof(PostDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Add([FromBody] AddCommentRequest request, CancellationToken cancellationToken)
    {
        var parentId = request.ParentCommentId != Guid.Empty ?
            request.ParentCommentId :
            null;

        var command = new AddCommentCommand(request.PostId, request.Content, parentId);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleCreated(result, comment => comment, comment => $"/api/threads/{comment.Id}");
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(PostDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCommentRequest request, CancellationToken cancellationToken)
    {
        var command = new UpdateCommentCommand(id, request.Content);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var command = new DeleteCommentCommand(id);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }

    [HttpPut("{id:guid}/restore")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Restore(Guid id, CancellationToken cancellationToken)
    {
        var command = new RestoreCommentCommand(id);

        var result = await Mediator.Send(command, cancellationToken);

        return HandleResult(result);
    }
}
