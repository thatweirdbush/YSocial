using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
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

internal sealed class LogoutUserCommandHandler(IAccountRepository accountRepository, IAccountSessionLock sessionLock)
    : ICommandHandler<LogoutUserCommand, Result>
{
    public async Task<Result> Handle(LogoutUserCommand request, CancellationToken cancellationToken)
    {
        // Advisory lookup without lock: unknown token = nothing to revoke
        var account = await accountRepository.GetByRefreshTokenAsync(request.RefreshToken, cancellationToken);
        if (account is null)
        {
            return Result.Success();
        }

        await using var _ = await sessionLock.AcquireAsync(account.Id, cancellationToken);

        // Revoking an already revoked/expired token is a no-op
        account.RevokeRefreshToken(request.RefreshToken);
        accountRepository.Update(account);

        return Result.Success();
    }
}
