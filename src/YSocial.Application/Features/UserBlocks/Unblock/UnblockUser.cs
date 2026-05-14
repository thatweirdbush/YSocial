using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserBlocks.Unblock;

public sealed record UnblockUserCommand(Guid TargetId) : ResultCommand;

internal sealed class UnblockUserCommandValidator : AbstractValidator<UnblockUserCommand>
{
    public UnblockUserCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class UnblockUserCommandHandler(
    IUserContext userContext,
    UserRelationManager relationManager)
    : ICommandHandler<UnblockUserCommand, Result>
{
    public async Task<Result> Handle(UnblockUserCommand request, CancellationToken cancellationToken)
    {
        var targetId = new UserId(request.TargetId);
        var observerId = new UserId(userContext.UserId);

        await relationManager.UnblockUserAsync(observerId, targetId, cancellationToken);

        return Result.Success();
    }
}
