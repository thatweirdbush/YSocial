using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.DeleteProfile;

public sealed record DeleteProfileCommand(Guid ProfileId) : ResultCommand;

internal sealed class DeleteProfileCommandValidator : AbstractValidator<DeleteProfileCommand>
{
    public DeleteProfileCommandValidator()
    {
        RuleFor(x => x.ProfileId).NotEmpty();
    }
}

internal sealed class DeleteProfileCommandHandler(
    IUserRepository userRepository,
    IUserContext userContext,
    UserProfileService userProfileService)
    : ICommandHandler<DeleteProfileCommand, Result>
{
    public async Task<Result> Handle(DeleteProfileCommand request, CancellationToken cancellationToken)
    {
        var accountId = new AccountId(userContext.AccountId);
        var targetUserId = new UserId(request.ProfileId);

        var allProfiles = await userRepository.GetByAccountIdAsync(accountId, cancellationToken);
        var targetUser = allProfiles.FirstOrDefault(u => u.Id == targetUserId);

        if (targetUser is null)
        {
            return Result.Fail("Profile not found.", ErrorType.NotFound);
        }

        userProfileService.VerifyDeletionRules(allProfiles);

        targetUser.Delete();
        userRepository.Update(targetUser);

        return Result.Success();
    }
}
