using MediatR;

namespace YSocial.Application.CQRS.Decorators.DomainEventsDispatching;

public record DummyNotification : INotification;

internal class DummyNotificationHandler : INotificationHandler<DummyNotification>
{
    public Task Handle(DummyNotification notification, CancellationToken ct) => Task.CompletedTask;
}
