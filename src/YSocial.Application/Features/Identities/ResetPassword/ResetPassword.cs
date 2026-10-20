using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.ResetPassword;

public sealed record ResetPasswordCommand(string LoginId, string Otp, string NewPassword) : ResultCommand;

internal sealed class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.LoginId)
            .NotEmpty();

        RuleFor(x => x.Otp)
            .NotEmpty()
            .Length(6);

        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(6);
    }
}

internal sealed class ResetPasswordCommandHandler(
    IAccountRepository accountRepository,
    IPasswordHasher passwordHasher,
    IAccountSessionLock sessionLock,
    IUnitOfWork unitOfWork)
    : ICommandHandler<ResetPasswordCommand, Result>
{
    public async Task<Result> Handle(ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        // Advisory id lookup, then lock, then load: the account is read after any concurrent token change was saved
        var accountId = await accountRepository.GetIdByIdentifierAsync(request.LoginId, cancellationToken);

        if (accountId is null)
        {
            return Result.Fail("Invalid request.", ErrorType.Business);
        }

        await using var _ = await sessionLock.AcquireAsync(accountId.Value, cancellationToken);

        var account = await accountRepository.GetByIdAsync(accountId.Value, cancellationToken);

        if (account is null)
        {
            return Result.Fail("Invalid request.", ErrorType.Business);
        }

        try
        {
            account.ResetPassword(request.Otp, request.NewPassword, passwordHasher);
        }
        catch (BusinessRuleValidationException)
        {
            // A wrong OTP counts as an attempt: that change MUST outlive the failed request (a failed request saves nothing)
            await unitOfWork.CommitAsync(cancellationToken);
            throw;
        }

        accountRepository.Update(account);

        // Saved INSIDE the lock (see refresh)
        await unitOfWork.CommitAsync(cancellationToken);

        return Result.Success();
    }
}
