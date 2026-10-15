using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Messaging;

namespace YSocial.Infrastructure.Messaging;

public class MockEmailSender(ILogger<MockEmailSender> logger) : IEmailSender
{
    public Task SendEmailAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("--- MOCK EMAIL SENDER ---");
        logger.LogInformation("To: {Email}", toEmail);
        logger.LogInformation("Subject: {Subject}", subject);
        logger.LogInformation("Body: {Body}", body);
        logger.LogInformation("-------------------------");

        return Task.CompletedTask;
    }
}
