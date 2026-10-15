using System.Collections.Concurrent;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Identity;

/// <inheritdoc cref="IAccountSessionLock"/>
public sealed class AccountSessionLock : IAccountSessionLock
{
    private readonly ConcurrentDictionary<AccountId, SemaphoreSlim> _locks = new();

    public async Task<IAsyncDisposable> AcquireAsync(AccountId accountId, CancellationToken cancellationToken = default)
    {
        var semaphore = _locks.GetOrAdd(accountId, _ => new SemaphoreSlim(1, 1));
        await semaphore.WaitAsync(cancellationToken);

        return new Releaser(semaphore);
    }

    private sealed class Releaser(SemaphoreSlim semaphore) : IAsyncDisposable
    {
        private int _released;

        public ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                semaphore.Release();
            }

            return ValueTask.CompletedTask;
        }
    }
}
