using FluentAssertions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NSubstitute;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Identities;
using YSocial.Domain.Identities.Events;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Messaging;

namespace YSocial.Api.IntegrationTests.Security;

/// <summary>
/// No password, OTP or token may reach a log line (BG s10.7).
/// </summary>
public class LogRedactionTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string NewPassword = "BrandNewSecret456!";

    private string AllLogs => string.Join('\n', Factory.Logs.Entries.Select(e => e.Message));

    private static Account TestAccount => MockDataStore.Accounts[SeedIds.TestAccount];

    private static string IssueOtp()
    {
        TestAccount.GeneratePasswordResetToken(new BCryptPasswordHasher());
        var otp = TestAccount.DomainEvents.OfType<PasswordResetTokenGeneratedEvent>().Last().PlainToken;
        TestAccount.ClearDomainEvents();
        return otp;
    }

    [Fact]
    public async Task Login_PipelineLogs_NoPasswordOrTokens()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);

        AllLogs.Should().Contain("LoginCommand", "the pipeline still logs the request");
        AllLogs.Should().Contain(Seed.TestLogin).And.Contain("***");
        AllLogs.Should().NotContain(Seed.Password)
            .And.NotContain(tokens.AccessToken)
            .And.NotContain(tokens.RefreshToken);
    }

    [Fact]
    public async Task RefreshToken_PipelineLogs_NoTokens()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);
        Factory.Logs.Clear();

        var response = await Client.PostAsJsonAsync("/api/identities/refresh-token", new { refreshToken = tokens.RefreshToken });
        response.EnsureSuccessStatusCode();
        var rotated = await response.ReadJsonAsync();

        AllLogs.Should().Contain("RefreshTokenCommand");
        AllLogs.Should().NotContain(tokens.RefreshToken)
            .And.NotContain(rotated.GetProperty("refreshToken").GetString()!)
            .And.NotContain(rotated.GetProperty("accessToken").GetString()!);
    }

    [Fact]
    public async Task Logout_PipelineLogs_NoToken()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);
        Factory.Logs.Clear();

        (await Client.PostAsJsonAsync("/api/identities/logout", new { refreshToken = tokens.RefreshToken })).EnsureSuccessStatusCode();

        AllLogs.Should().Contain("LogoutUserCommand").And.NotContain(tokens.RefreshToken);
    }

    [Fact]
    public async Task Register_PipelineLogs_NoPassword()
    {
        const string password = "RegisterSecret789!";

        var response = await Client.PostAsJsonAsync("/api/identities/register",
            new { email = "new.user@example.com", password, username = "new_user" });

        response.EnsureSuccessStatusCode();
        AllLogs.Should().Contain("RegisterAccountCommand").And.NotContain(password);
    }

    [Fact]
    public async Task ResetPassword_PipelineLogs_NoOtpOrPassword()
    {
        var otp = IssueOtp();

        var response = await Client.PostAsJsonAsync("/api/identities/reset-password",
            new { loginId = Seed.TestLogin, otp, newPassword = NewPassword });

        response.EnsureSuccessStatusCode();
        AllLogs.Should().Contain("ResetPasswordCommand");
        AllLogs.Should().NotContain(otp).And.NotContain(NewPassword);
    }

    [Fact]
    public async Task ForgotPassword_SenderLogs_NoOtp()
    {
        (await Client.PostAsJsonAsync("/api/identities/forgot-password", new { loginId = Seed.TestLogin })).EnsureSuccessStatusCode();

        var senderLines = Factory.Logs.Entries.Where(e => e.Category.Contains("Mock")).Select(e => e.Message).ToList();
        senderLines.Should().NotBeEmpty("the mock sender still reports the delivery");
        senderLines.Should().NotContain(line => Regex.IsMatch(line, @"\d{4,}"));
    }

    [Fact]
    public async Task FailedLogin_Logs_NoPassword()
    {
        const string wrong = "WrongPassword!987";

        var response = await Client.PostAsJsonAsync("/api/identities/login", new { loginId = Seed.TestLogin, password = wrong, deviceId = "d" });

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Unauthorized);
        AllLogs.Should().NotContain(wrong);
    }

    #region Mock senders

    private static (T Sender, CapturingLoggerProvider Logs) Build<T>(string environment, Func<ILogger<T>, IHostEnvironment, T> factory)
    {
        var provider = new CapturingLoggerProvider();
        var host = Substitute.For<IHostEnvironment>();
        host.EnvironmentName.Returns(environment);
        return (factory(new LoggerFactory([provider]).CreateLogger<T>(), host), provider);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task MockEmailSender_OutsideDevelopment_NeverLogsBody(string environment)
    {
        var (sender, logs) = Build<MockEmailSender>(environment, (l, e) => new MockEmailSender(l, e));

        await sender.SendEmailAsync("a@b.c", "Reset", "Your code is 123456");

        logs.Entries.Should().NotContain(e => e.Message.Contains("123456") || e.Message.Contains("Your code"));
    }

    [Fact]
    public async Task MockEmailSender_Development_MasksDigits()
    {
        var (sender, logs) = Build<MockEmailSender>("Development", (l, e) => new MockEmailSender(l, e));

        await sender.SendEmailAsync("a@b.c", "Reset", "Your code is 123456");

        logs.Entries.Should().Contain(e => e.Message.Contains("Your code is ****"));
        logs.Entries.Should().NotContain(e => e.Message.Contains("123456"));
    }

    [Theory]
    [InlineData("Production", false)]
    [InlineData("Development", true)]
    public async Task MockSmsSender_NeverLogsOtp(string environment, bool logsText)
    {
        var (sender, logs) = Build<MockSmsSender>(environment, (l, e) => new MockSmsSender(l, e));

        await sender.SendSmsAsync("+84900000000", "Code 654321");

        logs.Entries.Should().NotContain(e => e.Message.Contains("654321"));
        logs.Entries.Any(e => e.Message.Contains("Code ****")).Should().Be(logsText);
    }

    #endregion
}
