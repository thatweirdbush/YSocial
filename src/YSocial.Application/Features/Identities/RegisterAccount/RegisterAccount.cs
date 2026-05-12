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
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .WithMessage("Invalid email address.");

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(6);
    }
}

internal sealed class RegisterAccountCommandHandler(
    IAccountRepository accountRepository,
    IPasswordHasher passwordHasher)
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

        // 2. Hash password
        var hashedString = passwordHasher.Hash(request.Password);
        var passwordHash = PasswordHash.Create(hashedString);

        // 3. Create Account via Domain Factory
        var account = Account.Create(request.Email, null, passwordHash);

        // 4. Save to Repository
        await accountRepository.AddAsync(account, cancellationToken);

        return Result<AccountId>.Success(account.Id);
    }
}
