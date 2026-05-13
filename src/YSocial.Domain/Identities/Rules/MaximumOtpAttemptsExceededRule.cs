using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record MaximumOtpAttemptsExceededRule(bool IsMaxReached) : IBusinessRule
{
    public string Message => "Maximum OTP verification attempts exceeded. Please request a new code.";

    public bool BrokenWhen => IsMaxReached;
}
