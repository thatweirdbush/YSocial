using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.SetDefaultProfile;

public sealed record SetDefaultProfileCommand(Guid ProfileId) : ResultCommand;

internal sealed class SetDefaultProfileCommandValidator : AbstractValidator<SetDefaultProfileCommand>
{
    public SetDefaultProfileCommandValidator()
    {
        RuleFor(x => x.ProfileId).NotEmpty();
    }
}

internal sealed class SetDefaultProfileCommandHandler(
    IUserContext userContext,
    UserProfileService userProfileService)
    : ICommandHandler<SetDefaultProfileCommand, Result>
{
    public async Task<Result> Handle(SetDefaultProfileCommand request, CancellationToken cancellationToken)
    {
        var accountId = new AccountId(userContext.AccountId);
        var targetUserId = new UserId(request.ProfileId);

        // Perform the state change in domain
        await userProfileService.SetDefaultProfileAsync(accountId, targetUserId, cancellationToken);

        return Result.Success();
    }
}
