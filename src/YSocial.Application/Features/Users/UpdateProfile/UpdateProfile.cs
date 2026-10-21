using FluentValidation;
using FluentValidation.Results;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Media;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.UpdateProfile;

/// <summary>
/// Display name, bio, avatar &amp; cover replace the stored values; <c>Gender</c> and <c>DateOfBirth</c> are not exposed
/// by the read DTO, so omitting (null) keeps the stored value.
/// Avatar (D34): <paramref name="AvatarMediaId"/> = a just uploaded asset (never together with the <paramref name="AvatarUrl"/> key);
/// otherwise <paramref name="AvatarUrl"/> null clears, the stored url keeps it, anything else must be an external http(s) url.
/// </summary>
/// <param name="AvatarUrlSpecified">The request carried the <c>avatarUrl</c> key (even as null).</param>
public sealed record UpdateProfileCommand(
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    bool AvatarUrlSpecified,
    Guid? AvatarMediaId,
    string? CoverUrl,
    Gender? Gender,
    DateTime? DateOfBirth) : ResultCommand<UserProfileDto>;

internal sealed class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    private const int MaxUrlLength = 2048;

    public UpdateProfileCommandValidator()
    {
        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Bio)
            .MaximumLength(200);

        RuleFor(x => x.AvatarUrl).MaximumLength(MaxUrlLength);
        RuleFor(x => x.CoverUrl).MaximumLength(MaxUrlLength);

        RuleFor(x => x.DateOfBirth)
            .LessThan(DateTime.UtcNow.Date)
            .When(x => x.DateOfBirth.HasValue);
    }
}

internal sealed class UpdateProfileCommandHandler(
    IUserRepository userRepository,
    IMediaAssetRepository mediaRepository,
    IMediaStorage storage,
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

        var oldAvatar = user.ProfileInfo.AvatarUrl;
        string? newAvatar;

        if (request.AvatarMediaId is { } mediaId)
        {
            // 1. an uploaded asset: the url key would be ambiguous
            if (request.AvatarUrlSpecified)
            {
                throw Invalid(nameof(request.AvatarUrl), "Send either 'avatarMediaId' or 'avatarUrl', not both.");
            }

            var asset = (await mediaRepository.GetByIdsAsync([new MediaAssetId(mediaId)], cancellationToken)).FirstOrDefault();
            if (asset is null || asset.Kind != MediaKind.Image)
            {
                return Result<UserProfileDto>.NotFound("Resource not found.");
            }

            // Own, avatar purpose, Pending: else the same 404 as an unknown id
            asset.MarkAttached(userId, MediaPurpose.Avatar);
            newAvatar = asset.Url;
        }
        else
        {
            // 2. null / omitted clears, the stored url keeps, anything else must be external
            newAvatar = request.AvatarUrl;

            if (newAvatar is not null && newAvatar != oldAvatar)
            {
                if (!IsAbsoluteHttpUrl(newAvatar))
                {
                    throw Invalid(nameof(request.AvatarUrl), "'Avatar Url' must be an absolute http(s) URL.");
                }

                // Our assets enter ONLY through avatarMediaId: nobody can point at another user's file
                if (storage.OwnsUrl(newAvatar))
                {
                    throw Invalid(nameof(request.AvatarUrl), "'Avatar Url' cannot point at our own media storage: upload the file and send 'avatarMediaId'.");
                }
            }
        }

        // 3. the replaced or cleared avatar, when it was one of our assets, is released (deleted later by the sweep)
        if (newAvatar != oldAvatar && oldAvatar is not null)
        {
            var replaced = await mediaRepository.GetAttachedAvatarAsync(userId, oldAvatar, cancellationToken);
            replaced?.Release();
        }

        var profileInfo = new UserProfileInfo(
            request.DisplayName,
            request.Bio,
            newAvatar,
            request.CoverUrl,
            request.Gender ?? user.ProfileInfo.Gender,
            request.DateOfBirth ?? user.ProfileInfo.DateOfBirth,
            user.ProfileInfo.ProfileType);

        user.UpdateProfile(profileInfo);

        userRepository.Update(user);

        // Profile + attached asset + released asset leave in the ONE save of the pipeline: a failed request keeps the old avatar
        var profiles = await projector.ProjectAsync(user.Id, [user], cancellationToken: cancellationToken);

        return Result<UserProfileDto>.Success(profiles[0]);
    }

    private static ValidationException Invalid(string property, string message)
        => new([new ValidationFailure(property, message)]);

    private static bool IsAbsoluteHttpUrl(string url)
        => Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
