using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.RegisterAccount;

public sealed record RegisterAccountCommand(string Email, string Password, string Username, string? PhoneNumber = null)
    : ResultCommand<AccountId>;

/// <summary>
/// FORMAT only (400); uniqueness is the handler's job (409).
/// </summary>
internal sealed partial class RegisterAccountCommandValidator : AbstractValidator<RegisterAccountCommand>
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

        RuleFor(x => x.Username)
            .NotEmpty()
            .Matches("^[a-z0-9._]{3,30}$")
            .WithMessage("Username must be 3-30 characters: lowercase letters, digits, '.' or '_'.");
    }
}

internal sealed class RegisterAccountCommandHandler(
    IAccountRepository accountRepository,
    IUserRepository userRepository,
    IPasswordHasher passwordHasher)
    : ICommandHandler<RegisterAccountCommand, Result<AccountId>>
{
    public async Task<Result<AccountId>> Handle(RegisterAccountCommand request, CancellationToken cancellationToken)
    {
        // 1. Uniqueness BEFORE anything is created (no orphan account)
        if (!await userRepository.IsEmailUniqueAsync(request.Email, cancellationToken))
        {
            return Result<AccountId>.Conflict("Email is already registered.", ErrorCodes.EmailTaken);
        }

        if (await userRepository.IsUsernameTakenAsync(request.Username, cancellationToken))
        {
            return Result<AccountId>.Conflict("Username is already taken.", ErrorCodes.UsernameTaken);
        }

        // 2. Hash password
        var hashedString = passwordHasher.Hash(request.Password);
        var passwordHash = PasswordHash.Create(hashedString);

        // 3. Create Account via Domain Factory (username flows to profile init via AccountCreatedEvent)
        var account = Account.Create(request.Email, request.PhoneNumber, passwordHash, request.Username);

        // 4. Save to Repository
        await accountRepository.AddAsync(account, cancellationToken);

        return Result<AccountId>.Success(account.Id);
    }
}
