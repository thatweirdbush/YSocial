using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record PasswordResetTokenMustBeValidRule(PasswordResetToken? Token) : IBusinessRule
{
    public string Message => "The password reset token is invalid or has expired.";

    public bool BrokenWhen => Token == null || Token.IsUsed || Token.IsExpired();
}
