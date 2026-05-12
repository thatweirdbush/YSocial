using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record InvalidCredentialsRule(bool IsVerified) : IBusinessRule
{
    public string Message => "Invalid credentials.";

    public bool BrokenWhen => !IsVerified;
}
