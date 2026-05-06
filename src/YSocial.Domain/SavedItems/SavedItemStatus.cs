using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.SavedItems;

/// <summary>
/// Represents the action taken when toggling a saved item: either adding a saved item (Saved) or removing an existing saved item (Unsaved).
/// </summary>
public sealed record SavedItemStatus(int Value, string Name, int ScoreChange) : Enumeration<SavedItemStatus>
{
    public static readonly SavedItemStatus Saved = new(1, nameof(Saved), 1);
    public static readonly SavedItemStatus Unsaved = new(2, nameof(Unsaved), -1);
}
