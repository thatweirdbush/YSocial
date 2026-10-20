using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Likes.Rules;
using YSocial.Domain.SavedItems.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.SavedItems;

public sealed class SavedItem : AggregateRoot<SavedItemId>, ISoftDeletable
{
    public Guid TargetId { get; private set; }
    public SavedItemTargetType TargetType { get; private set; }
    public UserId UserId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

#pragma warning disable CS8618
    private SavedItem() { }
#pragma warning restore CS8618

    private SavedItem(Guid targetId, SavedItemTargetType targetType, UserId userId)
    {
        Id = SavedItemId.New();
        TargetId = targetId;
        TargetType = targetType;
        UserId = userId;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
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
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        AddDomainEvent(new SavedItemRemovedEvent(Id, TargetId, TargetType, UserId));
    }
}
