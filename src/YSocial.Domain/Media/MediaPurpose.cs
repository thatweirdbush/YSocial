using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Media;

public sealed record MediaPurpose(int Value, string Name) : Enumeration<MediaPurpose>
{
    public static readonly MediaPurpose Post = new(1, nameof(Post));
    public static readonly MediaPurpose Avatar = new(2, nameof(Avatar));
}
