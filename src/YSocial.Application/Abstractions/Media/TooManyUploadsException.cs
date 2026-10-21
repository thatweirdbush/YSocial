namespace YSocial.Application.Abstractions.Media;

/// <summary>
/// A concurrency gate of the upload endpoint is full (HTTP 429 <c>TooManyRequests</c>, <c>Retry-After: 5</c>).
/// </summary>
public sealed class TooManyUploadsException() : Exception("Too many uploads in progress. Retry shortly.");
