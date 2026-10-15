using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record RefreshTokenMustBeActiveRule(RefreshToken? RefreshToken) : IClassifiedRule
{
    public string Message => "Invalid or expired refresh token.";

    public bool BrokenWhen => RefreshToken is null || !RefreshToken.IsActive;

    public string Code => ErrorCodes.InvalidRefreshToken;

    public RuleViolationKind Kind => RuleViolationKind.Unauthorized;
}
