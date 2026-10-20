namespace YSocial.Application.Abstractions.Persistence;

/// <summary>
/// The data changed under the request (optimistic concurrency): nothing was saved, the client may retry. Maps to 409.
/// </summary>
public sealed class ConcurrencyConflictException(string message, Exception? innerException = null)
    : Exception(message, innerException);
