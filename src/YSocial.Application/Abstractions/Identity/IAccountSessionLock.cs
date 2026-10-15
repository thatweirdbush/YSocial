using YSocial.Domain.Identities;

namespace YSocial.Application.Abstractions.Identity;

/// <summary>
/// Per-account lock serializing EVERY refresh-token list mutation (login, refresh, logout, switch profile,
/// reset password, delete account). Process-local; multi-instance needs a DB concurrency token.
/// </summary>
public interface IAccountSessionLock
{
    /// <summary>
    /// Waits for the account's lock; dispose the result to release it.
    /// </summary>
    Task<IAsyncDisposable> AcquireAsync(AccountId accountId, CancellationToken cancellationToken = default);
}
