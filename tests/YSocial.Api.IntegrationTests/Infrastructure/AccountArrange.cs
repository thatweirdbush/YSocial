using YSocial.Domain.Identities;
using YSocial.Domain.Identities.Events;
using YSocial.Infrastructure.Identity;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Arranges account state directly in the database (no events dispatched).
/// </summary>
public static class AccountArrange
{
    /// <summary>
    /// Issues a password reset token for the account & returns the plain OTP (what the mock sender would log).
    /// </summary>
    public static string IssueOtp(AccountId id, int workFactor = 4)
    {
        var otp = string.Empty;

        Store.Accounts.Update(id, account =>
        {
            account.GeneratePasswordResetToken(new BCryptPasswordHasher(workFactor));
            otp = account.DomainEvents.OfType<PasswordResetTokenGeneratedEvent>().Last().PlainToken;
        });

        return otp;
    }

    /// <summary>
    /// Sets <see cref="RefreshToken.ExpiryTime"/> of the token (reflection: the setter is private).
    /// </summary>
    public static void ExpireToken(AccountId id, string token, DateTime expiry)
        => Store.Accounts.Update(id, account => typeof(RefreshToken).GetProperty(nameof(RefreshToken.ExpiryTime))!.GetSetMethod(true)!
            .Invoke(account.RefreshTokens.Single(t => t.Token == token), [expiry]));
}
