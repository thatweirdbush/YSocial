using Microsoft.AspNetCore.Mvc.Filters;
using YSocial.Api.Infrastructure.Errors;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Features.Media;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Users;

namespace YSocial.Api.Infrastructure.Filters;

/// <summary>
/// Per-user (1 in flight) and per-instance (<c>Media:MaxConcurrentUploads</c>) upload caps, taken BEFORE the multipart body is bound:
/// binding buffers the whole body to a temp file, so the gate must close first or the temp-disk bound would not hold.
/// Full gate = 429 <c>TooManyRequests</c> + <c>Retry-After: 5</c>; the lease is released when the request ends.
/// </summary>
public sealed class UploadGateFilter(IMediaUploadGate gate, IUserContext userContext) : IAsyncResourceFilter
{
    public const int Order = 10;

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        // Anonymous callers never get here (the action is [Authorize]); stay out of the way if they do
        if (!userContext.IsAuthenticated || userContext.UserId == Guid.Empty)
        {
            await next();
            return;
        }

        using var lease = gate.TryEnter(new UserId(userContext.UserId));
        if (lease is null)
        {
            context.HttpContext.Response.Headers.RetryAfter = "5";
            context.Result = ApiProblems.ToResult(context.HttpContext, StatusCodes.Status429TooManyRequests, ErrorCodes.TooManyRequests, "Too many uploads in progress. Retry shortly.");
            return;
        }

        await next();
    }
}
