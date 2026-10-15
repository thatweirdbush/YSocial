using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record DeviceSessionLimitRule(int ActiveSessionCount) : IClassifiedRule
{
    private const int MaxSessions = 5;
    public string Message => $"Cannot exceed the maximum limit of {MaxSessions} active sessions.";    
    public bool BrokenWhen => ActiveSessionCount >= MaxSessions;

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
