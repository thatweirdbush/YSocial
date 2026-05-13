using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
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
    IPasswordHasher passwordHasher)
    : ICommandHandler<ResetPasswordCommand, Result>
{
    public async Task<Result> Handle(ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        var account = await accountRepository.GetByIdentifierAsync(request.LoginId, cancellationToken);

        if (account is null)
        {
            return Result.Fail("Invalid request.", ErrorType.Business);
        }

        account.ResetPassword(request.Otp, request.NewPassword, passwordHasher);
        accountRepository.Update(account);

        return Result.Success();
    }
}
