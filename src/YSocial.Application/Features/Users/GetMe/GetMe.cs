using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.GetMe;

/// <summary>
/// Viewer bootstrap: active profile + account email + switcher list. Owner only.
/// </summary>
public sealed record GetMeQuery : ResultQuery<MeDto>;

internal sealed class GetMeQueryHandler(
    IUserRepository userRepository,
    IAccountRepository accountRepository,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetMeQuery, Result<MeDto>>
{
    public async Task<Result<MeDto>> Handle(GetMeQuery request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<MeDto>.Unauthorized();
        }

        var accountId = new AccountId(userContext.AccountId);
        var account = await accountRepository.GetByIdAsync(accountId, cancellationToken);
        var profile = await userRepository.GetByIdAndAccountIdAsync(new UserId(userContext.UserId), accountId, cancellationToken);

        // Token outlived its account or profile
        if (account is null || profile is null)
        {
            return Result<MeDto>.Unauthorized();
        }

        var profiles = await userRepository.GetByAccountIdAsync(accountId, cancellationToken);
        var projected = await projector.ProjectAsync(profile.Id, [profile], cancellationToken: cancellationToken);

        var switcher = profiles
            .OrderByDescending(p => p.IsDefault)
            .ThenBy(p => p.CreatedAt)
            .Select(p => new ProfileSummaryDto(p.Id.Value, p.Username, p.ProfileInfo.DisplayName, p.ProfileInfo.AvatarUrl, p.IsDefault))
            .ToList();

        var info = profile.ProfileInfo;
        var gender = char.ToLowerInvariant(info.Gender.Name[0]) + info.Gender.Name[1..];
        var dateOfBirth = info.DateOfBirth.HasValue ? DateOnly.FromDateTime(info.DateOfBirth.Value) : (DateOnly?)null;

        return Result<MeDto>.Success(new MeDto(projected[0], account.Email, switcher, gender, dateOfBirth));
    }
}
