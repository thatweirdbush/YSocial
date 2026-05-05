using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Posts;
using YSocial.Application.Features.Posts.CreatePost;
using YSocial.Application.Features.Posts.GetPost;

namespace YSocial.Api.Controllers;

public class PostsController : ApiController
{
    private readonly ILogger<PostsController> _logger;

    public PostsController(ILogger<PostsController> logger)
    {
        _logger = logger;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetPostById(Guid id)
    {
        var query = new GetPostQuery(id);

        var result = await Mediator.Send(query);

        return HandleResult(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePostRequest request)
    {
        var command = new CreatePostCommand(request.Content, request.ImageUrl);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePostRequest request)
    {
        var command = new YSocial.Application.Features.Posts.UpdatePost.UpdatePostCommand(id, request.Content);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var command = new YSocial.Application.Features.Posts.DeletePost.DeletePostCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
