namespace YSocial.Api.Models.Media;

/// <summary>
/// <c>multipart/form-data</c>: <c>files</c> (1..10) and <c>purpose</c> (<c>post</c> default | <c>avatar</c>).
/// </summary>
public sealed class UploadMediaRequest
{
    public IFormFileCollection Files { get; set; } = new FormFileCollection();

    public string? Purpose { get; set; }
}
