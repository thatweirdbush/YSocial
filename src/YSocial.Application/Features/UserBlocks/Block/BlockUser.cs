using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserBlocks.Block;

public sealed record BlockUserCommand(Guid TargetId) : ResultCommand;

internal sealed class BlockUserCommandValidator : AbstractValidator<BlockUserCommand>
{
    public BlockUserCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class BlockUserCommandHandler(
    IUserContext userContext,
    IUserRepository userRepository,
    UserRelationManager relationManager)
    : ICommandHandler<BlockUserCommand, Result>
{
    public async Task<Result> Handle(BlockUserCommand request, CancellationToken cancellationToken)
    {
        var targetId = new UserId(request.TargetId);
        var observerId = new UserId(userContext.UserId);

        if (targetId != observerId)
        {
            var target = await userRepository.GetByIdAsync(targetId, cancellationToken);
            if (target is null || target.IsDeleted)
            {
                return Result.NotFound("Resource not found.");
            }
        }

        await relationManager.BlockUserAsync(observerId, targetId, cancellationToken);

        return Result.Success();
    }
}
