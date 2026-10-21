namespace YSocial.Infrastructure.Media;

/// <summary>
/// <c>Cloudinary:*</c> keys (user-secrets / env, never logged); empty = media storage unavailable.
/// </summary>
public sealed record CloudinarySettings(string CloudName, string ApiKey, string ApiSecret)
{
    public const string Section = "Cloudinary";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(CloudName) && !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(ApiSecret);

    public static CloudinarySettings FromConfiguration(Microsoft.Extensions.Configuration.IConfiguration configuration)
        => new(
            configuration[$"{Section}:CloudName"]?.Trim() ?? string.Empty,
            configuration[$"{Section}:ApiKey"]?.Trim() ?? string.Empty,
            configuration[$"{Section}:ApiSecret"]?.Trim() ?? string.Empty);

    // Keep the secret out of logs & exception text
    public override string ToString() => $"CloudinarySettings {{ CloudName = {CloudName}, ApiKey = ***, ApiSecret = *** }}";
}
