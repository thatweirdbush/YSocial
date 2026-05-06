using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Likes.Rules;
using YSocial.Domain.SavedItems.Events;
using YSocial.Domain.Users;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.SavedItems;

public sealed class SavedItem : AggregateRoot<SavedItemId>
{
    public Guid TargetId { get; private set; }
    public SavedItemTargetType TargetType { get; private set; }
    public UserId UserId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private SavedItem(Guid targetId, SavedItemTargetType targetType, UserId userId)
    {
        Id = SavedItemId.New();
        TargetId = targetId;
        TargetType = targetType;
        UserId = userId;
        CreatedAt = DateTime.UtcNow;
    }

    public static SavedItem Create(Guid targetId, SavedItemTargetType targetType, UserId userId)
    {
        CheckRule(new UserIdMustNotBeEmptyRule(userId));

        var savedItem = new SavedItem(targetId, targetType, userId);
        savedItem.AddDomainEvent(new SavedItemCreatedEvent(savedItem.Id, targetId, targetType, userId));
        return savedItem;
    }

    public void Remove()
    {
        AddDomainEvent(new SavedItemRemovedEvent(Id, TargetId, TargetType, UserId));
    }
}
