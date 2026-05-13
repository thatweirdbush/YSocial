using MediatR;
using YSocial.Application.Abstractions.Messaging;
using YSocial.Domain.Identities.Events;

namespace YSocial.Application.Features.Identities.ForgotPassword;

internal sealed class PasswordResetTokenGeneratedEventHandler(
    IEmailSender emailSender,
    ISmsSender smsSender) : INotificationHandler<PasswordResetTokenGeneratedEvent>
{
    public async Task Handle(PasswordResetTokenGeneratedEvent notification, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(notification.Email))
        {
            await emailSender.SendEmailAsync(
                notification.Email,
                "Your Password Reset OTP",
                $"Your OTP is: {notification.PlainToken}",
                cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(notification.PhoneNumber))
        {
            await smsSender.SendSmsAsync(
                notification.PhoneNumber,
                $"Your YSocial OTP is: {notification.PlainToken}",
                cancellationToken);
        }
    }
}
