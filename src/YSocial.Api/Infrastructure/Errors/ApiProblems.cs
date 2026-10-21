using System.Diagnostics;
using YSocial.Domain.Common.Errors;

namespace YSocial.Api.Infrastructure.Errors;

/// <summary>
/// Single builder of the RFC 7807 error envelope (D1).
/// </summary>
public static class ApiProblems
{
    public const string ContentType = "application/problem+json";

    /// <summary>
    /// Creates a problem; <paramref name="errors"/> turns it into a validation problem.
    /// </summary>
    public static ProblemDetails Create(
        HttpContext context,
        int status,
        string code,
        string? detail = null,
        IDictionary<string, string[]>? errors = null)
    {
        var problem = errors is null
            ? new ProblemDetails { Status = status, Detail = detail }
            : new ValidationProblemDetails(errors) { Status = status, Detail = detail };

        problem.Extensions["code"] = code;
        Enrich(context, problem);
        return problem;
    }

    /// <summary>
    /// Fills envelope fields that are still missing (also used for framework-generated problems).
    /// </summary>
    public static void Enrich(HttpContext context, ProblemDetails problem)
    {
        var status = problem.Status ?? StatusCodes.Status500InternalServerError;
        problem.Status = status;
        problem.Title ??= TitleFor(status);
        problem.Type ??= TypeFor(status);
        problem.Instance ??= context.Request.Path.Value;

        if (!problem.Extensions.ContainsKey("code"))
        {
            problem.Extensions["code"] = CodeFor(status);
        }

        problem.Extensions["traceId"] = Activity.Current?.Id ?? context.TraceIdentifier;
    }

    public static IActionResult ToResult(HttpContext context, int status, string code, string? detail = null, IDictionary<string, string[]>? errors = null)
    {
        var problem = Create(context, status, code, detail, errors);

        return new ObjectResult(problem)
        {
            StatusCode = status,
            ContentTypes = { ContentType }
        };
    }

    /// <summary>
    /// Camel-cases every dotted segment (<c>Address.City</c> -> <c>address.city</c>), drops JSON path prefix.
    /// </summary>
    public static string ToFieldKey(string key)
    {
        var trimmed = key.TrimStart('$', '.');
        if (trimmed.Length == 0)
        {
            return "request";
        }

        return string.Join('.', trimmed.Split('.').Select(s => s.Length == 0 ? s : char.ToLowerInvariant(s[0]) + s[1..]));
    }

    public static string CodeFor(int status) => status switch
    {
        StatusCodes.Status400BadRequest => ErrorCodes.ValidationFailed,
        StatusCodes.Status401Unauthorized => ErrorCodes.Unauthenticated,
        StatusCodes.Status403Forbidden => ErrorCodes.Forbidden,
        StatusCodes.Status404NotFound => ErrorCodes.NotFound,
        StatusCodes.Status405MethodNotAllowed => ErrorCodes.MethodNotAllowed,
        StatusCodes.Status409Conflict => ErrorCodes.Conflict,
        StatusCodes.Status413PayloadTooLarge => ErrorCodes.PayloadTooLarge,
        StatusCodes.Status415UnsupportedMediaType => ErrorCodes.UnsupportedMediaType,
        StatusCodes.Status429TooManyRequests => ErrorCodes.TooManyRequests,
        StatusCodes.Status503ServiceUnavailable => ErrorCodes.MediaStorageUnavailable,
        _ => ErrorCodes.InternalError
    };

    private static string TitleFor(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "Bad Request",
        StatusCodes.Status401Unauthorized => "Unauthorized",
        StatusCodes.Status403Forbidden => "Forbidden",
        StatusCodes.Status404NotFound => "Not Found",
        StatusCodes.Status405MethodNotAllowed => "Method Not Allowed",
        StatusCodes.Status409Conflict => "Conflict",
        StatusCodes.Status413PayloadTooLarge => "Payload Too Large",
        StatusCodes.Status415UnsupportedMediaType => "Unsupported Media Type",
        StatusCodes.Status429TooManyRequests => "Too Many Requests",
        StatusCodes.Status503ServiceUnavailable => "Service Unavailable",
        StatusCodes.Status500InternalServerError => "Internal Server Error",
        _ => "Error"
    };

    private static string TypeFor(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "https://tools.ietf.org/html/rfc9110#section-15.5.1",
        StatusCodes.Status401Unauthorized => "https://tools.ietf.org/html/rfc9110#section-15.5.2",
        StatusCodes.Status403Forbidden => "https://tools.ietf.org/html/rfc9110#section-15.5.4",
        StatusCodes.Status404NotFound => "https://tools.ietf.org/html/rfc9110#section-15.5.5",
        StatusCodes.Status405MethodNotAllowed => "https://tools.ietf.org/html/rfc9110#section-15.5.6",
        StatusCodes.Status409Conflict => "https://tools.ietf.org/html/rfc9110#section-15.5.10",
        StatusCodes.Status413PayloadTooLarge => "https://tools.ietf.org/html/rfc9110#section-15.5.14",
        StatusCodes.Status415UnsupportedMediaType => "https://tools.ietf.org/html/rfc9110#section-15.5.16",
        StatusCodes.Status429TooManyRequests => "https://tools.ietf.org/html/rfc6585#section-4",
        StatusCodes.Status503ServiceUnavailable => "https://tools.ietf.org/html/rfc9110#section-15.6.4",
        _ => "https://tools.ietf.org/html/rfc9110#section-15.6.1"
    };
}
