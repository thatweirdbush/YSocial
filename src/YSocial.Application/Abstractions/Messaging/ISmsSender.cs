namespace YSocial.Application.Abstractions.Messaging;

public interface ISmsSender
{
    Task SendSmsAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default);
}
