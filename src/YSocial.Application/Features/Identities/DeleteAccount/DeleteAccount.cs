using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.DeleteAccount;

public sealed record DeleteAccountCommand : ResultCommand;

internal sealed class DeleteAccountCommandHandler(IAccountRepository accountRepository, IUserContext userContext, IAccountSessionLock sessionLock)
    : ICommandHandler<DeleteAccountCommand, Result>
{
    public async Task<Result> Handle(DeleteAccountCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var accountId = new AccountId(userContext.AccountId);
        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);

        if (account is null)
        {
            return Result.NotFound("Account not found.");
        }

        await using var _ = await sessionLock.AcquireAsync(account.Id, cancellationToken);

        account.Delete();
        accountRepository.Update(account);

        return Result.Success();
    }
}
