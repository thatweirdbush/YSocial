using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record RefreshTokenMustNotBeExpiredRule(DateTime ExpiryTime) : IClassifiedRule
{
    public string Message => "Refresh token expiry time must be in the future.";

    public bool BrokenWhen => ExpiryTime <= DateTime.UtcNow;

    public string Code => ErrorCodes.InvalidRefreshToken;

    public RuleViolationKind Kind => RuleViolationKind.Unauthorized;
}
