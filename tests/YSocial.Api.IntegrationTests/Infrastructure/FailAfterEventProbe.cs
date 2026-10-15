using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Raises a domain event on a static aggregate, then fails (throws or returns failed Result).
/// </summary>
public sealed record FailAfterEventCommand(bool ThrowException) : ResultCommand;

internal sealed class FailAfterEventHandler : ICommandHandler<FailAfterEventCommand, Result>
{
    public Task<Result> Handle(FailAfterEventCommand request, CancellationToken cancellationToken)
    {
        // Adds PostDeletedEvent to the shared aggregate
        MockDataStore.Posts[SeedIds.TestPost].Delete(SeedIds.TestUser);

        if (request.ThrowException)
        {
            throw new InvalidOperationException("boom after event");
        }

        return Task.FromResult(Result.Fail("failed after event"));
    }
}
