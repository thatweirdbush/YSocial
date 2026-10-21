namespace YSocial.Application.Features.Media;

/// <summary>
/// Single source of the media limits (spec 2.1, all sizes in MiB = 1,048,576 bytes).
/// </summary>
public static class MediaLimits
{
    private const long MiB = 1024 * 1024;

    public const int MaxFilesPerRequest = 10;
    public const long MaxImageBytes = 10 * MiB;
    public const long MaxVideoBytes = 100 * MiB;
    public const long MaxAggregateBytes = 100 * MiB;

    /// <summary>
    /// Body cap = aggregate + 2 MiB of multipart boundaries, headers and fields.
    /// </summary>
    public const long MaxBodyBytes = 102 * MiB;

    public const long MaxPixels = 50_000_000;
    public const int MaxImageSide = 12000;

    public const int MaxVideoSide = 4096;
    public const double MaxVideoSeconds = 10 * 60;

    /// <summary>
    /// Uploading + Pending assets per user.
    /// </summary>
    public const int MaxReservedPerUser = 30;
}
