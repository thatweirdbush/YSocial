using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Events;

public sealed record CommentCreatedEvent(CommentId CommentId, PostId PostId, UserId AuthorId) : DomainEvent;
