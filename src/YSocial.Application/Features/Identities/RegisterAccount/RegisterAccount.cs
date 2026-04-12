using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;

namespace YSocial.Application.Features.Identities.RegisterAccount;

public sealed record RegisterAccountCommand(string Email, string Password) : ResultCommand<AccountId>;

internal sealed class RegisterAccountCommandValidator : AbstractValidator<RegisterAccountCommand>
{
    public RegisterAccountCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6);
    }
}

internal sealed class RegisterAccountCommandHandler(IAccountRepository accountRepository)
    : ICommandHandler<RegisterAccountCommand, Result<AccountId>>
{
    public async Task<Result<AccountId>> Handle(RegisterAccountCommand request, CancellationToken cancellationToken)
    {
        // 1. Check if email already exists
        var existingAccount = await accountRepository.GetByEmailAsync(request.Email, cancellationToken);
        if (existingAccount is not null)
        {
            return Result<AccountId>.Conflict("Email is already registered.");
        }

        // 2. Hash password (In real world, use BCrypt or Argon2. Here we mock it by wrapping in PasswordHash)
        var passwordHash = PasswordHash.Create(request.Password); // Simplified for mock logic

        // 3. Create Account via Domain Factory
        var account = Account.Create(request.Email, passwordHash);

        // 4. Save to Repository
        await accountRepository.AddAsync(account, cancellationToken);

        return Result<AccountId>.Success(account.Id);
    }
}
