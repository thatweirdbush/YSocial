using YSocial.Domain.Users;

namespace YSocial.Domain.SavedItems;

/// <summary>
/// Domain service that encapsulates the stateless business rules for toggling saved items.
/// It does not retrieve data, only makes domain decisions.
/// </summary>
public sealed class SavedItemToggleService
{
    /// <summary>
    /// Evaluates whether to Save or Unsave based on the presence of an existing saved item.
    /// Does not interact with repositories directly.
    /// </summary>
    public SavedItemToggleResult ToggleSavedItem(SavedItem? existingSavedItem, Guid targetId, SavedItemTargetType targetType, UserId userId)
    {
        if (existingSavedItem is not null)
        {
            return new SavedItemToggleResult(SavedItemStatus.Unsaved, existingSavedItem);
        }

        var newSavedItem = SavedItem.Create(targetId, targetType, userId);
        return new SavedItemToggleResult(SavedItemStatus.Saved, newSavedItem);
    }
}
