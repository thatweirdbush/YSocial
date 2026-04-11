using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Identities;

public sealed record UserRole(int Value, string Name) : Enumeration<UserRole>
{
    public static readonly UserRole Member = Create(1, nameof(Member));
    public static readonly UserRole Moderator = Create(2, nameof(Moderator));
    public static readonly UserRole Admin = Create(3, nameof(Admin));

    public static UserRole Create(int value, string name)
    {
        // Giả sử bạn có các rule tương ứng cho Role
        // CheckRule(new RoleValueMustBePositive(value));
        // CheckRule(new RoleNameMustNotBeEmpty(name));
        return new(value, name);
    }
}
