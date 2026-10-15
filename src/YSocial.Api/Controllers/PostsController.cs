using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Models.Posts;
using YSocial.Application.Features.Posts.CreatePost;
using YSocial.Application.Features.Posts.DeletePost;
using YSocial.Application.Features.Posts.GetPost;
using YSocial.Application.Features.Posts.GetPostsByUserId;
using YSocial.Application.Features.Posts.RestorePost;
using YSocial.Application.Features.Posts.SharePostLink;
using YSocial.Application.Features.Posts.UpdatePost;

namespace YSocial.Api.Controllers;

public class PostsController : ApiController
{
    private readonly IConfiguration _configuration;

    public PostsController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(PostDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPostById(Guid id)
    {
        var query = new GetPostQuery(id);

        var result = await Mediator.Send(query);

        return HandleResult(result);
    }

    [HttpPost]
    [Authorize]
    [ProducesResponseType(typeof(PostDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Create([FromBody] CreatePostRequest request)
    {
        var command = new CreatePostCommand(request.Content, request.ImageUrl);

        var result = await Mediator.Send(command);
        return HandleCreated(result, post => post, post => $"/api/posts/{post.Id}");
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    [ProducesResponseType(typeof(PostDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePostRequest request)
    {
        var command = new UpdatePostCommand(id, request.Content);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var command = new DeletePostCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpPut("{id:guid}/restore")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Restore(Guid id)
    {
        var command = new RestorePostCommand(id);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }

    [HttpGet("user/{userId:guid}")]
    [ProducesResponseType(typeof(UserPostsPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPostsByUserId(Guid userId, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var query = new GetPostsByUserIdQuery(userId, page, pageSize);

        var result = await Mediator.Send(query);

        return HandleResult(result);
    }

    [HttpPost("{id:guid}/share-link")]
    [Authorize]
    [ProducesResponseType(typeof(SharePostLinkResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SharePostLink(Guid id, [FromQuery] string username)
    {
        var baseUrl = _configuration["App:FrontendUrl"] ?? "https://ysocial.com";

        var command = new SharePostLinkCommand(id, username, baseUrl);

        var result = await Mediator.Send(command);

        return HandleResult(result);
    }
}
