using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Comments.Events;

public sealed record CommentRestoredEvent(CommentId CommentId) : DomainEvent;
