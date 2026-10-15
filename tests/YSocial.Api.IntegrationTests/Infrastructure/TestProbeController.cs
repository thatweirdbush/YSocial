using FluentValidation;
using FluentValidation.Results;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Microservice.BuildingBlocks.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YSocial.Api.Controllers;
using YSocial.Application.CQRS.Results;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Test-only endpoints to pin generic error mapping (registered by <see cref="ApiFactory"/>).
/// </summary>
[ApiExplorerSettings(IgnoreApi = true)]
public class TestProbeController : ApiController
{
    public sealed record Echo(int Number);

    [HttpGet("result/{type}")]
    public IActionResult ResultOf(string type) => type switch
    {
        "validation" => HandleResult(Result.Validation("bad input")),
        "business" => HandleResult(Result.Fail("rule broken")),
        "unauthorized" => HandleResult(Result.Unauthorized()),
        "forbidden" => HandleResult(Result.Forbidden()),
        "notfound" => HandleResult(Result.NotFound()),
        "conflict" => HandleResult(Result.Conflict()),
        "none" => HandleResult(Result.Fail("bug", ErrorType.None)),
        _ => HandleResult(Result.Success())
    };

    [HttpGet("throw/{kind}")]
    public IActionResult Throw(string kind) => throw kind switch
    {
        "validation" => new ValidationException([new ValidationFailure("DisplayName", "must not be empty")]),
        "rule" => new BusinessRuleValidationException(new UnclassifiedRule()),
        "rulestring" => new BusinessRuleValidationException("custom failure"),
        "notfound" => new EntityNotFoundException("thing missing"),
        _ => new InvalidOperationException("secret internal detail")
    };

    [HttpPost("echo")]
    public IActionResult EchoBody([FromBody] Echo body) => Ok(body);

    [HttpGet("secure")]
    [Authorize]
    public IActionResult Secure() => Ok();

    private sealed record UnclassifiedRule : IBusinessRule
    {
        public string Message => "unclassified rule broken";

        public bool BrokenWhen => true;
    }
}
