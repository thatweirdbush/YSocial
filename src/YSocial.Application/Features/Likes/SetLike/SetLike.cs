using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.SetLike;

/// <summary>
/// Idempotent like state (D10): no-op when the target is already in the requested state.
/// </summary>
public sealed record SetLikeCommand(Guid TargetId, LikeTargetType TargetType, bool Liked) : ResultCommand;

internal sealed class SetLikeCommandValidator : AbstractValidator<SetLikeCommand>
{
    public SetLikeCommandValidator()
    {
        RuleFor(x => x.TargetId).NotEmpty();
    }
}

internal sealed class SetLikeCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    ILikeRepository likeRepository,
    LikeToggleService likeToggleService,
    IUserContext userContext)
    : ICommandHandler<SetLikeCommand, Result>
{
    public async Task<Result> Handle(SetLikeCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var likerId = new UserId(userContext.UserId);

        var targetAuthorId = await request.TargetType.GetTargetAuthorIdAsync(request.TargetId, postRepository, commentRepository, cancellationToken);
        if (targetAuthorId is not UserId validatedAuthorId)
        {
            return Result.NotFound("Target not found.");
        }

        var existingLike = await likeRepository.GetByUserAndTargetAsync(likerId, request.TargetId, request.TargetType, cancellationToken);
        if ((existingLike is not null) == request.Liked)
        {
            return Result.Success();
        }

        var toggleResult = likeToggleService.ToggleLike(existingLike, request.TargetId, request.TargetType, likerId, validatedAuthorId);

        if (toggleResult.Action == LikeStatus.Unliked)
        {
            toggleResult.Like.Remove();
            likeRepository.Remove(toggleResult.Like);
        }
        else
        {
            await likeRepository.AddAsync(toggleResult.Like, cancellationToken);
        }

        return Result.Success();
    }
}
