using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record InvalidCredentialsRule(bool IsVerified) : IClassifiedRule
{
    public string Message => "Invalid credentials.";

    public bool BrokenWhen => !IsVerified;

    public string Code => ErrorCodes.InvalidCredentials;

    public RuleViolationKind Kind => RuleViolationKind.Unauthorized;
}
