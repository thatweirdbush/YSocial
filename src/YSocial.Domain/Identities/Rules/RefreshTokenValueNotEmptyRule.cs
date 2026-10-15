using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record RefreshTokenValueNotEmptyRule(string RefreshToken) : IClassifiedRule
{
    public string Message => "Refresh token cannot be null or empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(RefreshToken);

    public string Code => ErrorCodes.InvalidRefreshToken;

    public RuleViolationKind Kind => RuleViolationKind.Unauthorized;
}
