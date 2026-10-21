namespace YSocial.Infrastructure.Media;

/// <summary>
/// Strict url ownership & poster derivation. NEVER a prefix or <c>Contains</c> check: the url is parsed and every part compared.
/// </summary>
public static class CloudinaryUrl
{
    private const string Host = "res.cloudinary.com";

    /// <summary>
    /// True for <c>https://res.cloudinary.com/{cloud}/{image|video}/upload/...</c> of THIS cloud only.
    /// The host is compared after <see cref="Uri"/> normalization (DNS names are case-insensitive), the cloud name is case-sensitive.
    /// </summary>
    public static bool Owns(string? url, string? cloudName)
    {
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(cloudName)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;

        if (uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length > 0 || !uri.IsDefaultPort) return false;
        if (!string.Equals(uri.Host, Host, StringComparison.Ordinal)) return false;

        var path = RawPath(url);
        if (path is null || ContainsTrickery(path)) return false;

        // /{cloud}/{image|video}/upload/{at least one more segment}
        var segments = path.Split('/', StringSplitOptions.None);
        if (segments.Length < 5 || segments[0].Length > 0) return false;
        if (segments.Skip(1).Any(s => s.Length == 0)) return false;

        return string.Equals(segments[1], cloudName, StringComparison.Ordinal)
               && (segments[2] == "image" || segments[2] == "video")
               && segments[3] == "upload";
    }

    /// <summary>
    /// LENIENT twin of <see cref="Owns"/> for the DENY guards (avatarUrl / imageUrl must not point at our assets): fails CLOSED.
    /// Any http(s) url whose host is <c>res.cloudinary.com</c> (case-insensitive, trailing dot ignored, any port) and whose
    /// path - after the normalization a browser applies (dot segments, encoded dots, repeated slashes) - starts with our cloud name
    /// (case-insensitive) counts as ours. User-info urls resolve to the REAL host, so they are judged by it.
    /// </summary>
    public static bool Targets(string? url, string? cloudName)
    {
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(cloudName)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return false;
        if (!string.Equals(uri.Host.TrimEnd('.'), Host, StringComparison.OrdinalIgnoreCase)) return false;

        var first = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();

        return string.Equals(first, cloudName, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Frame 0 of a video as <c>.jpg</c>: <c>.../upload/so_0/{rest}.jpg</c>.
    /// </summary>
    public static string PosterOf(string videoUrl)
    {
        const string marker = "/upload/";
        var index = videoUrl.IndexOf(marker, StringComparison.Ordinal);
        var withFrame = index < 0 ? videoUrl : videoUrl.Insert(index + marker.Length, "so_0/");

        var query = withFrame.IndexOfAny(['?', '#']);
        var path = query < 0 ? withFrame : withFrame[..query];
        var dot = path.LastIndexOf('.');
        var slash = path.LastIndexOf('/');

        return (dot > slash ? path[..dot] : path) + ".jpg";
    }

    // The path exactly as given (Uri would normalize dot segments away), without query or fragment
    private static string? RawPath(string url)
    {
        var start = url.IndexOf("://", StringComparison.Ordinal);
        if (start < 0) return null;

        var pathStart = url.IndexOf('/', start + 3);
        if (pathStart < 0) return null;

        var end = url.IndexOfAny(['?', '#'], pathStart);
        return end < 0 ? url[pathStart..] : url[pathStart..end];
    }

    private static bool ContainsTrickery(string path)
    {
        if (path.Contains('\\')) return true;

        var lowered = path.ToLowerInvariant();
        if (lowered.Contains("%2e") || lowered.Contains("%2f") || lowered.Contains("%5c")) return true;

        return path.Split('/').Any(s => s is "." or "..");
    }
}
