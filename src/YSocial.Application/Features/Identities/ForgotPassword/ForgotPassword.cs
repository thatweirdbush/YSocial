using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.ForgotPassword;

public sealed record ForgotPasswordCommand(string LoginId) : ResultCommand;

internal sealed class ForgotPasswordCommandValidator : AbstractValidator<ForgotPasswordCommand>
{
    public ForgotPasswordCommandValidator()
    {
        RuleFor(x => x.LoginId)
            .NotEmpty();
    }
}

internal sealed class ForgotPasswordCommandHandler(
    IAccountRepository accountRepository,
    IPasswordHasher passwordHasher,
    IAccountSessionLock sessionLock,
    IUnitOfWork unitOfWork)
    : ICommandHandler<ForgotPasswordCommand, Result>
{
    public async Task<Result> Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        // Advisory id lookup, then lock, then load (BG 6.4): a reset token changes the account version, so it must not
        // race with refresh/logout/login of the same account
        var accountId = await accountRepository.GetIdByIdentifierAsync(request.LoginId, cancellationToken);

        // Security: Always return success even if account is not found.
        if (accountId is null)
        {
            return Result.Success();
        }

        await using var _ = await sessionLock.AcquireAsync(accountId.Value, cancellationToken);

        var account = await accountRepository.GetByIdAsync(accountId.Value, cancellationToken);
        if (account is null)
        {
            return Result.Success();
        }

        account.GeneratePasswordResetToken(passwordHasher);
        accountRepository.Update(account);

        try
        {
            // Saved INSIDE the lock (see refresh)
            await unitOfWork.CommitAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException)
        {
            // Another instance changed the account first: the answer stays uniform (always 204, no account probing), user asks again
        }

        return Result.Success();
    }
}
