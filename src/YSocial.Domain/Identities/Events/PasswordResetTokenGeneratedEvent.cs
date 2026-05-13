using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Identities.Events;

public sealed record PasswordResetTokenGeneratedEvent(
    AccountId AccountId,
    string PlainToken,
    string? Email,
    string? PhoneNumber) : DomainEvent;
