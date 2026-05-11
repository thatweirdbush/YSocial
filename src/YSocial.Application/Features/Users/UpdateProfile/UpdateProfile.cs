using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.UpdateProfile;

public sealed record UpdateProfileCommand(
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    string? CoverUrl,
    Gender Gender,
    DateTime? DateOfBirth) : ResultCommand<bool>;

internal sealed class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    public UpdateProfileCommandValidator()
    {
        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Bio)
            .MaximumLength(200);

        RuleFor(x => x.Gender)
            .NotNull();

        RuleFor(x => x.DateOfBirth)
            .LessThan(DateTime.UtcNow.Date)
            .When(x => x.DateOfBirth.HasValue);
    }
}

internal sealed class UpdateProfileCommandHandler(
    IUserRepository userRepository,
    IUserContext userContext)
    : ICommandHandler<UpdateProfileCommand, Result<bool>>
{
    public async Task<Result<bool>> Handle(UpdateProfileCommand request, CancellationToken cancellationToken)
    {
        var userId = new UserId(userContext.UserId);
        var user = await userRepository.GetByIdAsync(userId, cancellationToken);

        if (user is null)
        {
            return Result<bool>.Fail("User profile not found.", ErrorType.NotFound);
        }

        var profileInfo = new UserProfileInfo(
            request.DisplayName,
            request.Bio,
            request.AvatarUrl,
            request.CoverUrl,
            request.Gender,
            request.DateOfBirth,
            user.ProfileInfo.ProfileType);

        user.UpdateProfile(profileInfo);

        userRepository.Update(user);

        return Result<bool>.Success(true);
    }
}
