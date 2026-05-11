using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Users;

public sealed record Gender(int Value, string Name) : Enumeration<Gender>
{
    public static readonly Gender Unspecified = new(0, nameof(Unspecified));
    public static readonly Gender Male = new(1, nameof(Male));
    public static readonly Gender Female = new(2, nameof(Female));
    public static readonly Gender Other = new(3, nameof(Other));
}
