using YSocial.Domain.Likes;

namespace YSocial.Api.Models.Likes;

public sealed record ToggleLikeRequest(Guid TargetId, LikeTargetType TargetType);
