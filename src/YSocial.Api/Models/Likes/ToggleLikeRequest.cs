namespace YSocial.Api.Models.Likes;

public sealed record ToggleLikeRequest(Guid TargetId, int TargetType);
