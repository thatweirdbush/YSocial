using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.RevokeSession;

/// <summary>
/// Ends the family of ANY token id of the caller's account (rotated ids resolve to their family). Unknown or foreign id = 404 (no probing);
/// an already ended family = success. Revoking the current session is a logout.
/// </summary>
public sealed record RevokeSessionCommand(Guid SessionId) : ResultCommand;

internal sealed class RevokeSessionCommandValidator : AbstractValidator<RevokeSessionCommand>
{
    public RevokeSessionCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
    }
}

internal sealed class RevokeSessionCommandHandler(
    IAccountRepository accountRepository,
    IAccountSessionLock sessionLock,
    IUnitOfWork unitOfWork,
    IUserContext userContext)
    : ICommandHandler<RevokeSessionCommand, Result>
{
    public async Task<Result> Handle(RevokeSessionCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var accountId = new AccountId(userContext.AccountId);

        // Lock BEFORE loading: the tokens must be read after any concurrent rotation was saved
        await using var _ = await sessionLock.AcquireAsync(accountId, cancellationToken);

        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);
        if (account is null)
        {
            return Result.Unauthorized();
        }

        if (!account.RevokeSession(new RefreshTokenId(request.SessionId)))
        {
            return Result.NotFound("Session not found.");
        }

        accountRepository.Update(account);

        // Saved INSIDE the lock (see refresh). A conflict from another instance propagates: GlobalExceptionHandler answers 409, the client retries
        await unitOfWork.CommitAsync(cancellationToken);

        return Result.Success();
    }
}
