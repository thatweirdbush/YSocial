using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Posts;

public sealed record PostVisibility(int Value, string Name) : Enumeration<PostVisibility>
{
    public static readonly PostVisibility Public = new(1, nameof(Public));
    public static readonly PostVisibility FollowersOnly = new(2, nameof(FollowersOnly));
    public static readonly PostVisibility Private = new(3, nameof(Private));
}
