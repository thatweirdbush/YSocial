using MediatR;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Infrastructure.Errors;
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

            return ProcessErrorResponse(result);
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

            return ProcessErrorResponse(result);
        }

        /// <summary>
        /// 400 problem with a field error (e.g. bad enum), same envelope as validation failures
        /// </summary>
        protected IActionResult ValidationProblemFor(string field, string message)
            => ApiProblems.ToResult(HttpContext, StatusCodes.Status400BadRequest, "ValidationFailed", "One or more validation errors occurred.",
                new Dictionary<string, string[]> { [ApiProblems.ToFieldKey(field)] = [message] });

        /// <summary>
        /// Map ErrorType to correct HTTP Status Code (RFC 7807 envelope)
        /// </summary>
        private IActionResult ProcessErrorResponse(Result result)
        {
            var status = result.ErrorType switch
            {
                ErrorType.Validation or ErrorType.Business => StatusCodes.Status400BadRequest,
                ErrorType.NotFound => StatusCodes.Status404NotFound,
                ErrorType.Conflict => StatusCodes.Status409Conflict,
                ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
                ErrorType.Forbidden => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status500InternalServerError // ErrorType.None = bug
            };

            return ApiProblems.ToResult(HttpContext, status, result.Code, result.Error);
        }
    }
}
