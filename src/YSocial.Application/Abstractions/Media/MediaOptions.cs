namespace YSocial.Application.Abstractions.Media;

/// <summary>
/// <c>Media:*</c> configuration (limits are fixed by the contract; these are the operational knobs).
/// </summary>
public sealed class MediaOptions
{
    public const string Section = "Media";

    /// <summary>
    /// Segment of the remote key (<c>ysocial/{env}/...</c>), keeps environments apart in one cloud.
    /// </summary>
    public string Environment { get; set; } = "development";

    /// <summary>
    /// Uploads running at once per instance (over it: 429).
    /// </summary>
    public int MaxConcurrentUploads { get; set; } = 4;

    public int PendingTtlHours { get; set; } = 24;

    /// <summary>
    /// Upper bound of the whole upload phase of one request; MUST stay well under <see cref="UploadingLeaseMinutes"/>.
    /// </summary>
    public TimeSpan UploadBudget { get; set; } = TimeSpan.FromMinutes(20);

    public int ReleasedGraceMinutes { get; set; } = 60;

    /// <summary>
    /// Age after which an unfinished upload row is swept (longer than any real upload).
    /// </summary>
    public int UploadingLeaseMinutes { get; set; } = 30;

    /// <summary>
    /// Age after which a Deleting row is retried.
    /// </summary>
    public int DeletingLeaseMinutes { get; set; } = 10;

    public int SweepIntervalMinutes { get; set; } = 10;

    public int SweepBatchSize { get; set; } = 50;
}
