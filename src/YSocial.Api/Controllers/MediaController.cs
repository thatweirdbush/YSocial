using Microsoft.AspNetCore.Authorization;
using YSocial.Api.Infrastructure.Filters;
using YSocial.Api.Models.Media;
using YSocial.Application.Features.Media;
using YSocial.Application.Features.Media.DiscardMedia;
using YSocial.Application.Features.Media.UploadMedia;

namespace YSocial.Api.Controllers;

public class MediaController : ApiController
{
    /// <summary>
    /// Uploads images and videos (assets start <c>Pending</c> until a post or avatar uses them, or they are discarded / swept).
    /// </summary>
    /// <remarks>Limits: spec 2.1 (<see cref="MediaLimits"/>). All-or-nothing: one failing file removes the whole request's uploads.</remarks>
    [HttpPost]
    [Authorize]
    [Consumes("multipart/form-data")]
    [RequestBodyLimitFilter(MediaLimits.MaxBodyBytes)]
    [RequestSizeLimit(MediaLimits.MaxBodyBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MediaLimits.MaxBodyBytes)]
    [ProducesResponseType(typeof(MediaDto[]), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Upload([FromForm] UploadMediaRequest request, CancellationToken cancellationToken)
    {
        var files = request.Files
            .Select(file => new UploadFile(DisplayName(file.FileName), file.Length, file.OpenReadStream))
            .ToList();

        var result = await Mediator.Send(new UploadMediaCommand(request.Purpose, files), cancellationToken);

        return HandleCreated(result, media => media);
    }

    /// <summary>
    /// Discards one of the caller's own <c>Pending</c> assets (best effort cleanup of a removed attachment or abandoned composer).
    /// </summary>
    /// <remarks>Foreign, unknown, attached, released or already deleted assets all answer the same 404.</remarks>
    [HttpDelete("{id:guid}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Discard(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new DiscardMediaCommand(id), cancellationToken));

    // Only for messages: never a path, never long
    private static string DisplayName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return name.Length > 80 ? name[..80] : name;
    }
}
