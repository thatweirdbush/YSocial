using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.DeleteAccount;

public sealed record DeleteAccountCommand : ResultCommand<bool>;

internal sealed class DeleteAccountCommandHandler(IAccountRepository accountRepository, IUserContext userContext)
    : ICommandHandler<DeleteAccountCommand, Result<bool>>
{
    public async Task<Result<bool>> Handle(DeleteAccountCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<bool>.Unauthorized();
        }

        // Assuming UserId mapping directly to AccountId
        var accountId = new AccountId(userContext.UserId);
        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);

        if (account is null)
        {
            return Result<bool>.NotFound("Account not found.");
        }

        account.Delete();
        accountRepository.Update(account);

        return Result<bool>.Success(true);
    }
}
