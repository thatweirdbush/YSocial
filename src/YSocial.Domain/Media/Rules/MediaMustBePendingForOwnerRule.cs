using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Media.Rules;

/// <summary>
/// Foreign, wrong-purpose or not-pending assets answer the same 404 (no id probing).
/// </summary>
internal sealed record MediaMustBePendingForOwnerRule(bool IsOwner, bool PurposeMatches, bool IsPending) : IClassifiedRule
{
    public string Message => "Resource not found.";

    public bool BrokenWhen => !IsOwner || !PurposeMatches || !IsPending;

    public string Code => ErrorCodes.NotFound;

    public RuleViolationKind Kind => RuleViolationKind.NotFound;
}
