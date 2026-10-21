using FluentAssertions;
using Xunit;
using YSocial.Api.Infrastructure.Errors;
using YSocial.Domain.Common.Errors;

namespace YSocial.Api.IntegrationTests.Media;

public class MediaErrorCodesTests
{
    [Theory]
    [InlineData(413, ErrorCodes.PayloadTooLarge)]
    [InlineData(429, ErrorCodes.TooManyRequests)]
    [InlineData(503, ErrorCodes.MediaStorageUnavailable)]
    public void CodeFor_MapsMediaStatuses(int status, string code)
        => ApiProblems.CodeFor(status).Should().Be(code);
}
