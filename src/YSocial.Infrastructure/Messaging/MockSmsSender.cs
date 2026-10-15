using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Messaging;

namespace YSocial.Infrastructure.Messaging;

public class MockSmsSender(ILogger<MockSmsSender> logger, IHostEnvironment environment) : ISmsSender
{
    public Task SendSmsAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Mock SMS to {PhoneNumber}", toPhoneNumber);

        if (environment.IsDevelopment())
        {
            logger.LogInformation("Mock SMS text (digit runs masked): {Message}", MessageLogMasking.Mask4PlusDigits(message));
        }

        return Task.CompletedTask;
    }
}
