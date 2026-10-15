using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Common.Rules;

/// <summary>
/// Business rule with an explicit HTTP-facing classification (never derived from class names).
/// <see cref="Code"/> & <see cref="Kind"/> MUST be constants (no state access).
/// </summary>
public interface IClassifiedRule : IBusinessRule
{
    /// <summary>
    /// Stable code from <see cref="Errors.ErrorCodes"/>.
    /// </summary>
    string Code { get; }

    RuleViolationKind Kind { get; }
}
