using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Application.Features.UserRelations.GetFollowRequests;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.UpdatePrivacy;

/// <summary>
/// Switches the private-account flag. Going public accepts ONLY pending requests (accepted followers are untouched,
/// events fire per edge); going private changes no edge. <c>acceptedCount</c> = actual transitions.
/// </summary>
public sealed record UpdatePrivacyCommand(bool? IsPrivate) : ResultCommand<PrivacyUpdatedDto>;

internal sealed class UpdatePrivacyCommandValidator : AbstractValidator<UpdatePrivacyCommand>
{
    public UpdatePrivacyCommandValidator()
    {
        RuleFor(x => x.IsPrivate).NotNull();
    }
}

internal sealed class UpdatePrivacyCommandHandler(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    AccessibleFollowRequests requests,
    IUserContext userContext)
    : ICommandHandler<UpdatePrivacyCommand, Result<PrivacyUpdatedDto>>
{
    public async Task<Result<PrivacyUpdatedDto>> Handle(UpdatePrivacyCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PrivacyUpdatedDto>.Unauthorized();
        }

        var user = await userRepository.GetByIdAsync(new UserId(userContext.UserId), cancellationToken);
        if (user is null)
        {
            return Result<PrivacyUpdatedDto>.Unauthorized();
        }

        var settings = user.PrivacySettings;
        var goingPublic = settings.IsPrivateProfile && !request.IsPrivate!.Value;

        user.UpdatePrivacySettings(new PrivacySettings(request.IsPrivate!.Value, settings.AllowDirectMessages, settings.ShowActivityStatus));
        userRepository.Update(user);

        // Only requests visible in the list & count are accepted, so acceptedCount matches what the user saw
        var accepted = 0;
        if (goingPublic)
        {
            foreach (var (_, edge) in await requests.LoadAsync(user.Id, cancellationToken))
            {
                edge.AcceptFollow();
                relationRepository.Update(edge);
                accepted++;
            }
        }

        return Result<PrivacyUpdatedDto>.Success(new PrivacyUpdatedDto(accepted));
    }
}
