namespace YSocial.Api.Models.Likes;

public sealed record ToggleLikeRequest(Guid UserId, Guid PostId);
