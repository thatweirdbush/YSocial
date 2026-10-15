using Microsoft.Extensions.Configuration;

namespace YSocial.Infrastructure.Identity;

/// <summary>
/// JWT configuration read ONCE at startup. A missing or short signing key fails the startup outside Development;
/// only Development falls back to <see cref="DevelopmentSecretKey"/> (never a deployable secret).
/// </summary>
public sealed record JwtSettings(string SecretKey, string Issuer, string Audience, int AccessTokenMinutes)
{
    public const int MinSecretLength = 32;
    public const string DevelopmentSecretKey = "development-only-signing-key-0123456789-not-a-secret";
    private const int DefaultAccessTokenMinutes = 15;
    private static readonly string[] KnownKeys = [DevelopmentSecretKey, "super-secret-key-that-should-be-long-enough-for-hs256!"];

    public static JwtSettings FromConfiguration(IConfiguration configuration, bool isDevelopment)
    {
        var secretKey = configuration["Jwt:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey) && isDevelopment)
        {
            secretKey = DevelopmentSecretKey;
        }

        if (string.IsNullOrWhiteSpace(secretKey))
        {
            throw new InvalidOperationException("Jwt:SecretKey is required (no default): set it through configuration or the environment.");
        }

        if (!isDevelopment && KnownKeys.Contains(secretKey))
        {
            throw new InvalidOperationException("Jwt:SecretKey is a publicly known development key: set a private one.");
        }

        if (secretKey.Length < MinSecretLength)
        {
            throw new InvalidOperationException($"Jwt:SecretKey must be at least {MinSecretLength} characters.");
        }

        return new JwtSettings(
            secretKey,
            configuration["Jwt:Issuer"] ?? "YSocialApi",
            configuration["Jwt:Audience"] ?? "YSocialClient",
            configuration.GetValue("Jwt:AccessTokenMinutes", DefaultAccessTokenMinutes));
    }
}
