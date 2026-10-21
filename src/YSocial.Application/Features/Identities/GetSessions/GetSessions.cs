using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.GetSessions;

/// <summary>
/// Active sign-ins of the caller's account, newest token issue first.
/// </summary>
public sealed record GetSessionsQuery : ResultQuery<IReadOnlyList<SessionDto>>;

internal sealed class GetSessionsQueryHandler(
    IAccountRepository accountRepository,
    IUserRepository userRepository,
    IUserContext userContext)
    : IRequestHandler<GetSessionsQuery, Result<IReadOnlyList<SessionDto>>>
{
    public async Task<Result<IReadOnlyList<SessionDto>>> Handle(GetSessionsQuery request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<IReadOnlyList<SessionDto>>.Unauthorized();
        }

        var account = await accountRepository.GetByIdAsync(new AccountId(userContext.AccountId), cancellationToken);
        if (account is null)
        {
            return Result<IReadOnlyList<SessionDto>>.Unauthorized();
        }

        var sessions = account.GetSessions();
        var usernames = (await userRepository.GetUsersByIdsAsync(sessions.Select(s => s.UserId), cancellationToken))
            .ToDictionary(u => u.Id, u => u.Username);

        var current = userContext.SessionId == Guid.Empty ? (RefreshTokenId?)null : new RefreshTokenId(userContext.SessionId);

        IReadOnlyList<SessionDto> dtos = sessions
            .Select(s => new SessionDto(
                s.HeadId.Value,
                s.UserAgent,
                usernames.GetValueOrDefault(s.UserId),
                s.CreatedAt,
                s.LastTokenIssuedAt,
                current is { } sid && account.BelongsToSession(s.HeadId, sid)))
            .ToList();

        return Result<IReadOnlyList<SessionDto>>.Success(dtos);
    }
}
