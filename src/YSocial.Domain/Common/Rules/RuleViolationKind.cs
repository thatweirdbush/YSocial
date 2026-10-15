namespace YSocial.Domain.Common.Rules;

/// <summary>
/// How a broken rule is reported to clients.
/// </summary>
public enum RuleViolationKind
{
    /// <summary>
    /// Bad input or state transition (400).
    /// </summary>
    Invalid,

    /// <summary>
    /// Caller lacks permission (403).
    /// </summary>
    Forbidden,

    /// <summary>
    /// Target unknown or hidden from caller (404).
    /// </summary>
    NotFound,

    /// <summary>
    /// State clash (409).
    /// </summary>
    Conflict,

    /// <summary>
    /// Credentials or token rejected (401).
    /// </summary>
    Unauthorized
}
