namespace YSocial.Api.Models.SavedItems;

public sealed record ToggleSavedItemRequest(Guid TargetId, int TargetType);
