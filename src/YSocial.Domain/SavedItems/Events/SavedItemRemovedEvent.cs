using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.SavedItems.Events;

public sealed record SavedItemRemovedEvent(SavedItemId SavedItemId, Guid TargetId, SavedItemTargetType TargetType, UserId UserId) : DomainEvent;
