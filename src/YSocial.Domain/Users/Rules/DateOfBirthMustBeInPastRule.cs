using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DateOfBirthMustBeInPastRule(DateTime? DateOfBirth) : IBusinessRule
{
    public string Message => "Date of birth must be in the past.";

    public bool BrokenWhen => DateOfBirth.HasValue && DateOfBirth.Value >= DateTime.UtcNow.Date;
}
