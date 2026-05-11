using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Users;

/// <summary>
/// Represents the type of user profile, which can be Personal, Business, or Creator.
/// </summary>
/// <remarks>
/// This classification helps tailor the user experience and features based on the profile type.
/// </remarks>
/// <param name="Value">The numeric value representing the profile type.</param>
/// <param name="Name">The name of the profile type.</param>
public sealed record ProfileType(int Value, string Name) : Enumeration<ProfileType>
{
    public static readonly ProfileType Personal = new(1, nameof(Personal));
    public static readonly ProfileType Business = new(2, nameof(Business));
    public static readonly ProfileType Creator = new(3, nameof(Creator));
}
