namespace YSocial.Api.Models.Identities;

public sealed record RegisterAccountRequest(string Email, string Password, string Username, string? PhoneNumber = null);
