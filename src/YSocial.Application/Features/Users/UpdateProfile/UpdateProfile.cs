using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.UpdateProfile;

public sealed record UpdateProfileCommand(
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    string? CoverUrl,
    Gender Gender,
    DateTime? DateOfBirth) : ResultCommand<UserProfileDto>;

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
    IUserContext userContext,
    UserProfileProjector projector)
    : ICommandHandler<UpdateProfileCommand, Result<UserProfileDto>>
{
    public async Task<Result<UserProfileDto>> Handle(UpdateProfileCommand request, CancellationToken cancellationToken)
    {
        var userId = new UserId(userContext.UserId);
        var user = await userRepository.GetByIdAsync(userId, cancellationToken);

        if (user is null)
        {
            return Result<UserProfileDto>.NotFound("User profile not found.");
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

        var profiles = await projector.ProjectAsync(user.Id, [user], cancellationToken: cancellationToken);

        return Result<UserProfileDto>.Success(profiles[0]);
    }
}
