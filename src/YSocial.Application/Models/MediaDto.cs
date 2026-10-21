namespace YSocial.Application.Models;

/// <summary>
/// An uploaded or attached media item.
/// </summary>
/// <param name="Kind"><c>image</c> | <c>video</c>.</param>
/// <param name="Url">Delivery url WITHOUT transformation (the FE loader adds <c>f_auto,q_auto</c>).</param>
/// <param name="PosterUrl">Videos only (frame 0 as jpg).</param>
/// <param name="DurationSeconds">Videos only.</param>
public sealed record MediaDto(
    Guid Id,
    string Kind,
    string Url,
    string? PosterUrl,
    int Width,
    int Height,
    double? DurationSeconds,
    long Bytes);
