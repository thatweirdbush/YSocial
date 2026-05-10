namespace YSocial.Application.Abstractions.Identity;

public interface IUserContext
{
    Guid UserId { get; }
    Guid AccountId { get; }
    string? Email { get; }
    bool IsAuthenticated { get; }
}
