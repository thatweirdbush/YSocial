using FluentAssertions;
using MediatR;
using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Behaviors.UnitOfWork;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;

namespace YSocial.Application.UnitTests.Cqrs;

public class EventDispatchUnitTests
{
    private sealed record TestEvent : DomainEvent;

    private sealed record TestCommand : ResultCommand;

    private static IReadOnlyCollection<IDomainEvent> OneEvent() => [new TestEvent()];

    [Fact]
    public async Task Dispatcher_StopsAfterMaxPasses()
    {
        var mediator = Substitute.For<IMediator>();
        var provider = Substitute.For<IDomainEventsProvider>();
        provider.DrainDomainEvents().Returns(_ => OneEvent());
        var dispatcher = new DomainEventsDispatcher(mediator, provider, NullLogger<DomainEventsDispatcher>.Instance);

        var act = () => dispatcher.DispatchEventsAsync(CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
        await mediator.Received(DomainEventsDispatcher.MaxPasses).Publish(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Dispatcher_DrainsUntilEmpty_PublishingEachPass()
    {
        var mediator = Substitute.For<IMediator>();
        var provider = Substitute.For<IDomainEventsProvider>();
        provider.DrainDomainEvents().Returns(_ => OneEvent(), _ => OneEvent(), _ => []);
        var dispatcher = new DomainEventsDispatcher(mediator, provider, NullLogger<DomainEventsDispatcher>.Instance);

        await dispatcher.DispatchEventsAsync(CancellationToken.None);

        await mediator.Received(2).Publish(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Dispatcher_HandlerFailure_DiscardsRemainingAndRethrows()
    {
        var mediator = Substitute.For<IMediator>();
        mediator.Publish(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>()).Throws(new InvalidOperationException("handler boom"));
        var provider = Substitute.For<IDomainEventsProvider>();
        provider.DrainDomainEvents().Returns(_ => new IDomainEvent[] { new TestEvent(), new TestEvent() }, _ => OneEvent());
        var dispatcher = new DomainEventsDispatcher(mediator, provider, NullLogger<DomainEventsDispatcher>.Instance);

        var act = () => dispatcher.DispatchEventsAsync(CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("handler boom");
        await mediator.Received(1).Publish(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>()); // 2nd event never published
        provider.Received(2).DrainDomainEvents(); // 2nd call = discard of whatever handlers raised
    }

    [Fact]
    public async Task FailedResult_SkipsCommit()
    {
        var unitOfWork = Substitute.For<IUnitOfWork>();
        var pending = Substitute.For<IPendingDomainEvents>();
        var behavior = new TransactionBehavior<TestCommand, Result>(unitOfWork, pending, NullLogger<TransactionBehavior<TestCommand, Result>>.Instance);

        var result = await behavior.Handle(new TestCommand(), _ => Task.FromResult(Result.Fail("nope")), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        await unitOfWork.DidNotReceive().CommitAsync(Arg.Any<CancellationToken>());
        pending.Received(1).Discard();
    }

    [Fact]
    public async Task HandlerException_SkipsCommit_DiscardsAndRethrows()
    {
        var unitOfWork = Substitute.For<IUnitOfWork>();
        var pending = Substitute.For<IPendingDomainEvents>();
        var behavior = new TransactionBehavior<TestCommand, Result>(unitOfWork, pending, NullLogger<TransactionBehavior<TestCommand, Result>>.Instance);

        var act = () => behavior.Handle(new TestCommand(), _ => throw new InvalidOperationException("boom"), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
        await unitOfWork.DidNotReceive().CommitAsync(Arg.Any<CancellationToken>());
        pending.Received(1).Discard();
    }

    [Fact]
    public async Task SuccessResult_Commits()
    {
        var unitOfWork = Substitute.For<IUnitOfWork>();
        var pending = Substitute.For<IPendingDomainEvents>();
        var behavior = new TransactionBehavior<TestCommand, Result>(unitOfWork, pending, NullLogger<TransactionBehavior<TestCommand, Result>>.Instance);

        var result = await behavior.Handle(new TestCommand(), _ => Task.FromResult(Result.Success()), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        await unitOfWork.Received(1).CommitAsync(Arg.Any<CancellationToken>());
        pending.DidNotReceive().Discard();
    }
}
