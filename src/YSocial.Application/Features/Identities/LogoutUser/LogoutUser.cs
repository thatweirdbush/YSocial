using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.LogoutUser;

public sealed record LogoutUserCommand(string RefreshToken) : ResultCommand;

internal sealed class LogoutUserCommandValidator : AbstractValidator<LogoutUserCommand>
{
    public LogoutUserCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty();
    }
}

internal sealed class LogoutUserCommandHandler(IAccountRepository accountRepository, IUserContext userContext)
    : ICommandHandler<LogoutUserCommand, Result>
{
    public async Task<Result> Handle(LogoutUserCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Fail("Unauthorized access. You must be logged in to log out.");
        }

        var accountId = new AccountId(userContext.UserId);
        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);
        
        if (account is null)
        {
            return Result.NotFound("Account not found. Unable to log out.");
        }

        // Even if it doesn't exist or is already revoked,
        // there'll be no exception thrown.
        account.RevokeRefreshToken(request.RefreshToken);

        accountRepository.Update(account);

        return Result.Success();
    }
}
