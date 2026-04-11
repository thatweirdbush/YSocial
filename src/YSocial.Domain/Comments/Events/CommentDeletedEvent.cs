using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Comments.Events;

public sealed record CommentDeletedEvent(CommentId CommentId) : DomainEvent;
