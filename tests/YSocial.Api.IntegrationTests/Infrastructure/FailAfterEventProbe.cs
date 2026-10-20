using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Raises a domain event on a tracked aggregate, then fails (throws or returns failed Result): the request must save nothing.
/// </summary>
public sealed record FailAfterEventCommand(bool ThrowException) : ResultCommand;

internal sealed class FailAfterEventHandler(IPostRepository posts) : ICommandHandler<FailAfterEventCommand, Result>
{
    public async Task<Result> Handle(FailAfterEventCommand request, CancellationToken cancellationToken)
    {
        // Soft-deletes the tracked post & adds PostDeletedEvent
        var post = await posts.GetByIdAsync(SeedIds.TestPost, cancellationToken);
        post!.Delete(SeedIds.TestUser);

        if (request.ThrowException)
        {
            throw new InvalidOperationException("boom after event");
        }

        return Result.Fail("failed after event");
    }
}
