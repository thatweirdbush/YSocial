using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.DeleteAccount;

public sealed record DeleteAccountCommand : ResultCommand;

internal sealed class DeleteAccountCommandHandler(IAccountRepository accountRepository, IUserContext userContext, IAccountSessionLock sessionLock, IUnitOfWork unitOfWork)
    : ICommandHandler<DeleteAccountCommand, Result>
{
    public async Task<Result> Handle(DeleteAccountCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var accountId = new AccountId(userContext.AccountId);

        // Lock BEFORE loading (see switch profile)
        await using var _ = await sessionLock.AcquireAsync(accountId, cancellationToken);

        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);

        if (account is null)
        {
            return Result.NotFound("Account not found.");
        }

        account.Delete();
        accountRepository.Update(account);

        // Saved INSIDE the lock (see refresh); dispatches AccountDeletedEvent (profiles are soft-deleted in the same save)
        await unitOfWork.CommitAsync(cancellationToken);

        return Result.Success();
    }
}
