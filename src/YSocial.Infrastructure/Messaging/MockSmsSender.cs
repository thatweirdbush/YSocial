using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Messaging;

namespace YSocial.Infrastructure.Messaging;

public class MockSmsSender(ILogger<MockSmsSender> logger) : ISmsSender
{
    public Task SendSmsAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("--- MOCK SMS SENDER ---");
        logger.LogInformation("To: {PhoneNumber}", toPhoneNumber);
        logger.LogInformation("Message: {Message}", message);
        logger.LogInformation("-----------------------");
        
        return Task.CompletedTask;
    }
}
