using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Messaging;
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
    IPasswordHasher passwordHasher)
    : ICommandHandler<ForgotPasswordCommand, Result>
{
    public async Task<Result> Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        var account = await accountRepository.GetByIdentifierAsync(request.LoginId, cancellationToken);

        // Security: Always return success even if account is not found.
        if (account is null)
        {
            return Result.Success();
        }

        account.GeneratePasswordResetToken(passwordHasher);
        accountRepository.Update(account);

        return Result.Success();
    }
}
