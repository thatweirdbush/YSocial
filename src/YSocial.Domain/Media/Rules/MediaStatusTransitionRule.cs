using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Media.Rules;

internal sealed record MediaStatusTransitionRule(string From, string To, bool Allowed) : IClassifiedRule
{
    public string Message => $"A media asset cannot move from {From} to {To}.";

    public bool BrokenWhen => !Allowed;

    public string Code => ErrorCodes.Conflict;

    public RuleViolationKind Kind => RuleViolationKind.Conflict;
}
