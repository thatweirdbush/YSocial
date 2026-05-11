using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record NoSensitiveWordsRule(string Text) : IBusinessRule
{
    private static readonly string[] SensitiveWords = ["badword1", "badword2", "sensitive"];

    public string Message => "The text contains sensitive or forbidden words.";

    public bool BrokenWhen => SensitiveWords.Any(word => Text.Contains(word, StringComparison.OrdinalIgnoreCase));
}
