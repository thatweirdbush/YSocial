using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.UserRelations;

public sealed record FollowStatus(int Value, string Name) : Enumeration<FollowStatus>
{
    public static readonly FollowStatus None = new(0, nameof(None));
    public static readonly FollowStatus Pending = new(1, nameof(Pending));
    public static readonly FollowStatus Accepted = new(2, nameof(Accepted));
}
