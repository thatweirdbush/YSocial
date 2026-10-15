using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.Follow;

public sealed record FollowUserCommand(Guid TargetId) : ResultCommand<FollowUserResponse>;

internal sealed class FollowUserCommandValidator : AbstractValidator<FollowUserCommand>
{
    public FollowUserCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class FollowUserCommandHandler(
    IUserContext userContext,
    UserRelationManager relationManager)
    : ICommandHandler<FollowUserCommand, Result<FollowUserResponse>>
{
    public async Task<Result<FollowUserResponse>> Handle(FollowUserCommand request, CancellationToken cancellationToken)
    {
        var observerId = new UserId(userContext.UserId);
        var targetId = new UserId(request.TargetId);

        var relation = await relationManager.FollowUserAsync(observerId, targetId, cancellationToken);

        return Result<FollowUserResponse>.Success(new FollowUserResponse(char.ToLowerInvariant(relation.FollowStatus.Name[0]) + relation.FollowStatus.Name[1..]));
    }
}
