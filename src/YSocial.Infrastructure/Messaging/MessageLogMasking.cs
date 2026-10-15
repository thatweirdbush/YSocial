using System.Text.RegularExpressions;

namespace YSocial.Infrastructure.Messaging;

/// <summary>
/// Mock senders never log a usable secret: outside Development the message body is not logged at all,
/// in Development digit runs of 4 or more (OTPs) are masked.
/// </summary>
internal static partial class MessageLogMasking
{
    public const string Mask = "****";

    public static string Mask4PlusDigits(string text) => DigitRun().Replace(text, Mask);

    [GeneratedRegex(@"\d{4,}")]
    private static partial Regex DigitRun();
}
