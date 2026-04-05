using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts.Events;

public sealed record PostCreatedEvent(PostId PostId, UserId AuthorId) : DomainEvent;
