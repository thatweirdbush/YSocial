using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record UsernameMustBeMinimumLengthRule(string Username) : IBusinessRule
{
    public string Message => "Username must have at least 3 characters.";
    public bool BrokenWhen => Username?.Length < 3;
}
