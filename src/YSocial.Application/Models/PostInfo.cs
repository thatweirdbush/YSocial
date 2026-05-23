namespace YSocial.Application.Models;

public record PostInfo(
    Guid Id,
    string Content,
    string? ImageUrl,
    DateTime CreatedAt,
    Guid AuthorId,
    string AuthorName);
