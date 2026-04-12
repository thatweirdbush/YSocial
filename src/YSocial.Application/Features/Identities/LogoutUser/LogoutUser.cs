using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.LogoutUser;

public sealed record LogoutUserCommand(string Email, string RefreshToken) : ResultCommand;

internal sealed class LogoutUserCommandValidator : AbstractValidator<LogoutUserCommand>
{
    public LogoutUserCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.RefreshToken).NotEmpty();
    }
}

internal sealed class LogoutUserCommandHandler(IAccountRepository accountRepository)
    : ICommandHandler<LogoutUserCommand, Result>
{
    public async Task<Result> Handle(LogoutUserCommand request, CancellationToken cancellationToken)
    {
        var account = await accountRepository.GetByEmailAsync(request.Email, cancellationToken);
        if (account is null)
        {
            return Result.NotFound("Account not found.");
        }

        account.RevokeRefreshToken(request.RefreshToken);

        accountRepository.Update(account);

        return Result.Success();
    }
}
