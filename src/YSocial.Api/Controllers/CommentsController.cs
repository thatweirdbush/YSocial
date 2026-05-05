using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Comments;
using YSocial.Application.Features.Comments.AddComment;
using YSocial.Application.Features.Comments.DeleteComment;
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
    public async Task<IActionResult> Add([FromBody] AddCommentRequest request)
    {
        var command = new AddCommentCommand(request.PostId, request.Content, request.ParentCommentId);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCommentRequest request)
    {
        var command = new UpdateCommentCommand(id, request.Content);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var command = new DeleteCommentCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
