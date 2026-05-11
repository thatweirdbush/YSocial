using Microservice.BuildingBlocks.Domain.ValueObjects;

namespace YSocial.Domain.Users;

public sealed record PrivacySettings : ValueObject
{
    public bool IsPrivateProfile { get; private set; }
    public bool AllowDirectMessages { get; private set; }
    public bool ShowActivityStatus { get; private set; }

    private PrivacySettings() { }

    public PrivacySettings(bool isPrivateProfile, bool allowDirectMessages, bool showActivityStatus)
    {
        IsPrivateProfile = isPrivateProfile;
        AllowDirectMessages = allowDirectMessages;
        ShowActivityStatus = showActivityStatus;
    }

    public static PrivacySettings Default() => new(false, true, true);
}
