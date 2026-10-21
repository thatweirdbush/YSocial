namespace YSocial.Application.Abstractions.Media;

/// <summary>
/// Keys missing or provider unreachable/unauthorized (HTTP 503 <c>MediaStorageUnavailable</c>).
/// </summary>
public sealed class MediaStorageUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Provider refused the file (size, format, kind mismatch): HTTP 400 <c>ValidationFailed</c>, never 500.
/// </summary>
public sealed class MediaRejectedException(string message) : Exception(message);
