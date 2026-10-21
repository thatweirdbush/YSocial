using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Media;

public sealed record MediaKind(int Value, string Name) : Enumeration<MediaKind>
{
    public static readonly MediaKind Image = new(1, nameof(Image));
    public static readonly MediaKind Video = new(2, nameof(Video));
}
