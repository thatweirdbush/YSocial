using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record DeviceSessionLimitRule(int ActiveSessionCount) : IBusinessRule
{
    private const int MaxSessions = 5;
    public string Message => $"Cannot exceed the maximum limit of {MaxSessions} active sessions.";    
    public bool BrokenWhen => ActiveSessionCount >= MaxSessions;
}
