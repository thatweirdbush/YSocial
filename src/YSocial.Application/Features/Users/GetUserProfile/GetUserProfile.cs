using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.GetUserProfile;

/// <summary>
/// Anonymous allowed. Blocked either way, deleted & unknown are all 404 (D14, D20); private profiles still answer 200 (D15).
/// </summary>
public sealed record GetUserProfileByIdQuery(Guid UserId) : ResultQuery<UserProfileDto>;

public sealed record GetUserProfileByUsernameQuery(string Username) : ResultQuery<UserProfileDto>;

internal sealed class GetUserProfileByIdQueryValidator : AbstractValidator<GetUserProfileByIdQuery>
{
    public GetUserProfileByIdQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
    }
}

internal sealed class GetUserProfileByUsernameQueryValidator : AbstractValidator<GetUserProfileByUsernameQuery>
{
    public GetUserProfileByUsernameQueryValidator()
    {
        RuleFor(x => x.Username).NotEmpty().MaximumLength(30);
    }
}

internal sealed class GetUserProfileQueryHandler(
    IUserRepository userRepository,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetUserProfileByIdQuery, Result<UserProfileDto>>,
      IRequestHandler<GetUserProfileByUsernameQuery, Result<UserProfileDto>>
{
    public async Task<Result<UserProfileDto>> Handle(GetUserProfileByIdQuery request, CancellationToken cancellationToken)
        => await ProjectAsync(await userRepository.GetByIdAsync(new UserId(request.UserId), cancellationToken), cancellationToken);

    public async Task<Result<UserProfileDto>> Handle(GetUserProfileByUsernameQuery request, CancellationToken cancellationToken)
        => await ProjectAsync(await userRepository.GetByUsernameAsync(request.Username, cancellationToken), cancellationToken);

    private async Task<Result<UserProfileDto>> ProjectAsync(User? user, CancellationToken cancellationToken)
    {
        if (user is null)
        {
            return NotFound();
        }

        var profiles = await projector.ProjectAsync(userContext.GetViewerId(), [user], cancellationToken: cancellationToken);

        // Dropped by the access policy = blocked either way
        return profiles.Count == 0 ? NotFound() : Result<UserProfileDto>.Success(profiles[0]);
    }

    private static Result<UserProfileDto> NotFound() => Result<UserProfileDto>.NotFound("User not found.");
}
