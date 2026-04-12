using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Likes;

/// <summary>
/// Represents the action taken when toggling a like: either adding a like (Liked) or removing an existing like (Unliked).
/// </summary>
public sealed record LikeStatus(int Value, string Name, int ScoreChange) : Enumeration<LikeStatus>
{
    public static readonly LikeStatus Liked = new(1, nameof(Liked), 1);
    public static readonly LikeStatus Unliked = new(0, nameof(Unliked), -1);
}
