using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace YSocial.Infrastructure.Messaging;

/// <summary>
/// Mock senders never log a usable secret: outside Development the message body is not logged at all,
/// in Development digit runs of 4 or more (OTPs) are masked unless <see cref="DevelopmentOtpSetting"/> opts in.
/// </summary>
internal static partial class MessageLogMasking
{
    public const string Mask = "****";

    /// <summary>
    /// Development-only opt-in (default false) to log message bodies unmasked, so OTP flows can be exercised by hand.
    /// </summary>
    public const string DevelopmentOtpSetting = "Messaging:LogOtpInDevelopment";

    public static string Mask4PlusDigits(string text) => DigitRun().Replace(text, Mask);

    /// <summary>
    /// Body text safe to log: raw only in Development with the opt-in, masked otherwise.
    /// </summary>
    public static string ForDevelopmentLog(string text, IConfiguration configuration, IHostEnvironment environment) =>
        environment.IsDevelopment() && configuration.GetValue<bool>(DevelopmentOtpSetting) ? text : Mask4PlusDigits(text);

    [GeneratedRegex(@"\d{4,}")]
    private static partial Regex DigitRun();
}
