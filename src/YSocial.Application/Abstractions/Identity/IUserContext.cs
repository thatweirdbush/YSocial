namespace YSocial.Application.Abstractions.Identity;

public interface IUserContext
{
    Guid UserId { get; }
    Guid AccountId { get; }
    string? Email { get; }

    /// <summary>
    /// Refresh token id the access token was issued with (<c>sid</c> claim); <see cref="Guid.Empty"/> when missing.
    /// </summary>
    Guid SessionId { get; }
    bool IsAuthenticated { get; }
}
