using Microservice.BuildingBlocks.Domain.ValueObjects;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;

public sealed record UserProfileInfo : ValueObject
{
    public string DisplayName { get; private set; }
    public string? Bio { get; private set; }
    public string? AvatarUrl { get; private set; }
    public string? CoverUrl { get; private set; }
    public Gender Gender { get; private set; }
    public DateTime? DateOfBirth { get; private set; }
    public ProfileType ProfileType { get; private set; }

#pragma warning disable CS8618
    private UserProfileInfo() { }
#pragma warning restore CS8618

    public UserProfileInfo(
        string displayName,
        string? bio,
        string? avatarUrl,
        string? coverUrl,
        Gender gender,
        DateTime? dateOfBirth,
        ProfileType profileType)
    {
        CheckRule(new DisplayNameMustNotBeEmptyRule(displayName));
        CheckRule(new DisplayNameLengthRule(displayName));
        CheckRule(new NoSensitiveWordsRule(displayName));
        CheckRule(new BioLengthRule(bio));
        CheckRule(new DateOfBirthMustBeInPastRule(dateOfBirth));

        DisplayName = displayName;
        Bio = bio;
        AvatarUrl = avatarUrl;
        CoverUrl = coverUrl;
        Gender = gender;
        DateOfBirth = dateOfBirth;
        ProfileType = profileType;
    }

    public static UserProfileInfo CreateDefault(string displayName)
        => new(displayName, null, null, null, Gender.Unspecified, null, ProfileType.Personal);
}
