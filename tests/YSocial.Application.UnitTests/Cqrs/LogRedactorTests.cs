using FluentAssertions;
using Xunit;
using YSocial.Application.CQRS.Behaviors.Logging;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Identities.Login;
using YSocial.Application.Features.Identities.ResetPassword;

namespace YSocial.Application.UnitTests.Cqrs;

public class LogRedactorTests
{
    private sealed record Marked(string Name, [property: SensitiveData] string Pin);

    private sealed record Nested(string Label, Marked Inner, IReadOnlyList<Marked> Many);

    [Fact]
    public void Describe_MasksPasswordOtpAndTokensByName_KeepsTheRest()
    {
        var text = LogRedactor.Describe(new ResetPasswordCommand("me@x.com", "123456", "Sup3rSecret!"));

        text.Should().Contain("me@x.com").And.Contain("LoginId");
        text.Should().NotContain("123456").And.NotContain("Sup3rSecret!");
        text.Should().Contain("Otp = ***").And.Contain("NewPassword = ***");
    }

    [Fact]
    public void Describe_LoginCommandAndResponse_NoSecrets()
    {
        var command = LogRedactor.Describe(new LoginCommand("me@x.com", "pw-secret", "device-1"));
        var response = LogRedactor.Describe(Result<LoginResponse>.Success(new LoginResponse("access.jwt.value", "refresh-guid", DateTime.UtcNow)));

        command.Should().NotContain("pw-secret").And.Contain("device-1");
        response.Should().NotContain("access.jwt.value").And.NotContain("refresh-guid");
        response.Should().Contain("AccessToken = ***").And.Contain("RefreshToken = ***");
    }

    [Fact]
    public void Describe_FailedResult_DoesNotThrow()
    {
        var text = LogRedactor.Describe(Result<LoginResponse>.Unauthorized("nope"));

        text.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void Describe_AttributeMarksNonObviousNames_AndRecursesIntoNestedAndCollections()
    {
        var value = new Nested("n", new Marked("a", "1111"), [new Marked("b", "2222")]);

        var text = LogRedactor.Describe(value);

        text.Should().NotContain("1111").And.NotContain("2222");
        text.Should().Contain("Name = a").And.Contain("Name = b");
    }

    [Fact]
    public void Describe_Null_IsNullText() => LogRedactor.Describe(null).Should().Be("null");
}
