using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Messaging;

namespace YSocial.Infrastructure.Messaging;

public class MockSmsSender(ILogger<MockSmsSender> logger, IHostEnvironment environment, IConfiguration configuration) : ISmsSender
{
    public Task SendSmsAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Mock SMS to {PhoneNumber}", toPhoneNumber);

        if (environment.IsDevelopment())
        {
            logger.LogInformation("Mock SMS text (digit runs masked unless opted in): {Message}",
                MessageLogMasking.ForDevelopmentLog(message, configuration, environment));
        }

        return Task.CompletedTask;
    }
}
