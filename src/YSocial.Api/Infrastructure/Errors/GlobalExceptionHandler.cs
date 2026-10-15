using FluentValidation;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Microservice.BuildingBlocks.Domain.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using YSocial.Domain.Common.Errors;

namespace YSocial.Api.Infrastructure.Errors;

/// <summary>
/// Maps every exception to the documented status + code (§4.1); only unexpected faults are 500.
/// </summary>
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = Map(httpContext, exception);

        if (problem.Status == StatusCodes.Status500InternalServerError)
        {
            logger.LogError(exception, "Unhandled exception on {Path}", httpContext.Request.Path);
        }
        else
        {
            logger.LogInformation("Request rejected ({Code}): {Message}", problem.Extensions["code"], exception.Message);
        }

        httpContext.Response.StatusCode = problem.Status!.Value;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception
        });
    }

    private ProblemDetails Map(HttpContext context, Exception exception)
    {
        switch (exception)
        {
            case ValidationException validation:
                var errors = validation.Errors
                    .GroupBy(e => ApiProblems.ToFieldKey(e.PropertyName))
                    .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
                return ApiProblems.Create(context, StatusCodes.Status400BadRequest, ErrorCodes.ValidationFailed,
                    "One or more validation errors occurred.", errors);

            case BusinessRuleValidationException rule:
                var (status, code) = Classify(rule);
                return ApiProblems.Create(context, status, code, rule.Details);

            case EntityNotFoundException notFound:
                return ApiProblems.Create(context, StatusCodes.Status404NotFound, ErrorCodes.NotFound, notFound.Message);

            default:
                var detail = environment.IsDevelopment() ? exception.Message : "An unexpected error occurred.";
                return ApiProblems.Create(context, StatusCodes.Status500InternalServerError, ErrorCodes.InternalError, detail);
        }
    }

    private static (int Status, string Code) Classify(BusinessRuleValidationException exception)
        => (StatusCodes.Status400BadRequest, ErrorCodes.BusinessRuleViolated);
}
