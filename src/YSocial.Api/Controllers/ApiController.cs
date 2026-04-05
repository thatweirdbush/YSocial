using MediatR;
using Microsoft.AspNetCore.Mvc;
using YSocial.Application.CQRS.Results;

namespace YSocial.Api.Controllers
{
    //[Authorize(AuthenticationSchemes = "Bearer")]
    [Route("api/[controller]")]
    [ApiController]
    public abstract class ApiController : ControllerBase
    {
        private IMediator? _mediator;
        /// <summary>
        /// Lazily resolve the MediatR instance from the DI container when first accessed
        /// </summary>
        protected IMediator Mediator => _mediator ??= HttpContext.RequestServices.GetRequiredService<IMediator>();

        /// <summary>
        /// Handle Result with data returned (T)
        /// </summary>
        protected IActionResult HandleResult<T>(Result<T> result)
        {
            if (result == null)
                return NotFound();

            if (result.IsSuccess)
                return result.Value is null ? NoContent() : Ok(result.Value);

            return ProcessErrorResponse(result.Error, result.ErrorType);
        }

        /// <summary>
        /// Handle Result with no data returned (void/Unit)
        /// </summary>
        protected IActionResult HandleResult(Result result)
        {
            if (result == null)
                return NotFound();

            if (result.IsSuccess)
                return NoContent();

            return ProcessErrorResponse(result.Error, result.ErrorType);
        }

        /// <summary>
        /// Map ErrorType to correct HTTP Status Code
        /// </summary>
        private IActionResult ProcessErrorResponse(string error, ErrorType errorType)
        {
            return errorType switch
            {
                ErrorType.Validation => BadRequest(CreateProblemDetails("Validation Error", error, 400)),
                ErrorType.NotFound => NotFound(CreateProblemDetails("Not Found", error, 404)),
                ErrorType.Conflict => Conflict(CreateProblemDetails("Conflict", error, 409)),
                ErrorType.Business => BadRequest(CreateProblemDetails("Business Rule Violation", error, 400)),
                _ => BadRequest(CreateProblemDetails("Error", error, 400))
            };
        }

        /// <summary>
        /// Create the RFC 7807 standard error structure (Problem Details)
        /// </summary>
        private static object CreateProblemDetails(string title, string detail, int status)
        {
            return new
            {
                Title = title,
                Detail = detail,
                Status = status,
                Timestamp = DateTime.UtcNow
            };
        }
    }
}
