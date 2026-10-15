using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record NoSensitiveWordsRule(string Text) : IClassifiedRule
{
    private static readonly string[] SensitiveWords = ["badword1", "badword2", "sensitive"];

    public string Message => "The text contains sensitive or forbidden words.";

    public bool BrokenWhen => SensitiveWords.Any(word => Text.Contains(word, StringComparison.OrdinalIgnoreCase));

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
