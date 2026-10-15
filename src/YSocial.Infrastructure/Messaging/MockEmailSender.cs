using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Messaging;

namespace YSocial.Infrastructure.Messaging;

public class MockEmailSender(ILogger<MockEmailSender> logger, IHostEnvironment environment) : IEmailSender
{
    public Task SendEmailAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Mock email to {Email}: {Subject}", toEmail, subject);

        if (environment.IsDevelopment())
        {
            logger.LogInformation("Mock email body (digit runs masked): {Body}", MessageLogMasking.Mask4PlusDigits(body));
        }

        return Task.CompletedTask;
    }
}
