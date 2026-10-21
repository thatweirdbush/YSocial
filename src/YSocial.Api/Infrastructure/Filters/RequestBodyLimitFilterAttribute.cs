using Microsoft.AspNetCore.Mvc.Filters;
using YSocial.Api.Infrastructure.Errors;
using YSocial.Domain.Common.Errors;

namespace YSocial.Api.Infrastructure.Filters;

/// <summary>
/// Answers 413 <c>PayloadTooLarge</c> from the declared <c>Content-Length</c> BEFORE the body is bound or buffered.
/// Servers that enforce <c>[RequestSizeLimit]</c> (Kestrel) also cut chunked bodies; this check makes the contract
/// hold on every host (and testable) and keeps a huge upload from reaching the temp file.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class RequestBodyLimitFilterAttribute(long maxBytes) : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        if (context.HttpContext.Request.ContentLength is not { } declared || declared <= maxBytes) return;

        context.Result = ApiProblems.ToResult(
            context.HttpContext,
            StatusCodes.Status413PayloadTooLarge,
            ErrorCodes.PayloadTooLarge,
            $"The request body must not exceed {maxBytes / (1024 * 1024)} MiB.");
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}
