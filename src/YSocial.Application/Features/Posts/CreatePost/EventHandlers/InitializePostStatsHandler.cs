using MediatR;
using Microsoft.Extensions.Logging;
using YSocial.Domain.Posts.Events;

namespace YSocial.Application.Features.Posts.CreatePost.EventHandlers;

internal sealed class InitializePostStatsHandler(ILogger<InitializePostStatsHandler> logger) : INotificationHandler<PostCreatedEvent>
{
    public Task Handle(PostCreatedEvent notification, CancellationToken cancellationToken)
    {
        logger.LogInformation("Initializing stats for post {PostId}", notification.PostId);
        return Task.CompletedTask;
    }
}
