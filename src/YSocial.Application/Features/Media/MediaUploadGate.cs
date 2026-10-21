using System.Collections.Concurrent;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Media;

/// <summary>
/// Non-blocking resource caps of the upload endpoint: 1 in-flight request per user & <see cref="MediaOptions.MaxConcurrentUploads"/> per instance
/// (process-local; across instances the quota token decides).
/// </summary>
public interface IMediaUploadGate
{
    /// <summary>
    /// A lease to dispose when the upload ends, or null when a gate is full.
    /// </summary>
    IDisposable? TryEnter(UserId userId);
}

internal sealed class MediaUploadGate(MediaOptions options) : IMediaUploadGate
{
    private readonly SemaphoreSlim _instance = new(options.MaxConcurrentUploads, options.MaxConcurrentUploads);
    private readonly ConcurrentDictionary<UserId, byte> _users = new();

    public IDisposable? TryEnter(UserId userId)
    {
        if (!_users.TryAdd(userId, 0)) return null;

        if (!_instance.Wait(0))
        {
            _users.TryRemove(userId, out _);
            return null;
        }

        return new Lease(this, userId);
    }

    private sealed class Lease(MediaUploadGate gate, UserId userId) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 1) return;

            gate._users.TryRemove(userId, out _);
            gate._instance.Release();
        }
    }
}
