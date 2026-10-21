using System.Text.Json.Serialization;
using YSocial.Domain.Users;

namespace YSocial.Api.Models.Users;

/// <summary>
/// REPLACE semantics for <c>displayName</c>, <c>bio</c>, <c>avatarUrl</c>, <c>coverUrl</c>. An uploaded avatar is sent as
/// <c>avatarMediaId</c> WITHOUT the <c>avatarUrl</c> key (both together = 400).
/// </summary>
public sealed class UpdateProfileRequest
{
    private string? _avatarUrl;

    public string DisplayName { get; init; } = string.Empty;

    public string? Bio { get; init; }

    /// <summary>
    /// <c>null</c> or omitted clears the avatar; the stored url keeps it; any other value must be an external http(s) url.
    /// </summary>
    public string? AvatarUrl
    {
        get => _avatarUrl;
        init
        {
            _avatarUrl = value;
            AvatarUrlSpecified = true;
        }
    }

    /// <summary>
    /// True when the JSON body carried the <c>avatarUrl</c> key at all (even <c>null</c>): the deserializer calls the setter only then.
    /// </summary>
    [JsonIgnore]
    public bool AvatarUrlSpecified { get; private set; }

    /// <summary>
    /// A just uploaded Pending avatar asset (<c>POST /api/media</c> with purpose <c>avatar</c>).
    /// </summary>
    public Guid? AvatarMediaId { get; init; }

    public string? CoverUrl { get; init; }

    public Gender? Gender { get; init; }

    public DateTime? DateOfBirth { get; init; }
}
