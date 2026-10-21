using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Media;

/// <summary>
/// Uploading -> Pending -> Attached -> Released; deletion always passes through Deleting (row removed after the remote delete).
/// </summary>
public sealed record MediaAssetStatus(int Value, string Name) : Enumeration<MediaAssetStatus>
{
    public static readonly MediaAssetStatus Uploading = new(1, nameof(Uploading));
    public static readonly MediaAssetStatus Pending = new(2, nameof(Pending));
    public static readonly MediaAssetStatus Attached = new(3, nameof(Attached));
    public static readonly MediaAssetStatus Released = new(4, nameof(Released));
    public static readonly MediaAssetStatus Deleting = new(5, nameof(Deleting));
}
