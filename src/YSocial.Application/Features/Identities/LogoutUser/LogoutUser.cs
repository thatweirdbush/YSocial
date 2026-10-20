using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.LogoutUser;

/// <summary>
/// Anonymous; always succeeds for any well-formed token (unknown, revoked, expired or active).
/// </summary>
public sealed record LogoutUserCommand(string RefreshToken) : ResultCommand;

internal sealed class LogoutUserCommandValidator : AbstractValidator<LogoutUserCommand>
{
    public LogoutUserCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty();
    }
}

internal sealed class LogoutUserCommandHandler(IAccountRepository accountRepository, IAccountSessionLock sessionLock, IUnitOfWork unitOfWork)
    : ICommandHandler<LogoutUserCommand, Result>
{
    public async Task<Result> Handle(LogoutUserCommand request, CancellationToken cancellationToken)
    {
        // Advisory lookup without lock (untracked snapshot): unknown token = nothing to revoke
        var found = await accountRepository.GetByRefreshTokenAsync(request.RefreshToken, cancellationToken);
        if (found is null)
        {
            return Result.Success();
        }

        await using var _ = await sessionLock.AcquireAsync(found.Id, cancellationToken);

        var account = await accountRepository.GetByIdAsync(found.Id, includeDeleted: true, cancellationToken);
        if (account is null)
        {
            return Result.Success();
        }

        // Revoking an already revoked/expired token is a no-op
        account.RevokeRefreshToken(request.RefreshToken);
        accountRepository.Update(account);

        // Saved INSIDE the lock (see refresh)
        try
        {
            await unitOfWork.CommitAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException)
        {
            // Another instance changed the account first: logout never fails (contract: always 204)
        }

        return Result.Success();
    }
}
