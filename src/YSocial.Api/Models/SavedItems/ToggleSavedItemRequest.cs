using YSocial.Domain.SavedItems;

namespace YSocial.Api.Models.SavedItems;

public sealed record ToggleSavedItemRequest(Guid TargetId, SavedItemTargetType TargetType);
