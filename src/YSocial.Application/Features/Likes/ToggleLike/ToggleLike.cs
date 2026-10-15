using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.ToggleLike;

public sealed record ToggleLikeCommand(Guid TargetId, LikeTargetType TargetType) : ResultCommand<ToggleLikeResponse>;

internal sealed class ToggleLikeCommandValidator : AbstractValidator<ToggleLikeCommand>
{
    public ToggleLikeCommandValidator()
    {
        RuleFor(x => x.TargetId)
            .NotEmpty();

        RuleFor(x => x.TargetType)
            .NotNull();
    }
}

internal sealed class ToggleLikeCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    ILikeRepository likeRepository,
    LikeToggleService likeToggleService,
    InteractionGuard interactionGuard,
    IUserContext userContext)
    : ICommandHandler<ToggleLikeCommand, Result<ToggleLikeResponse>>
{
    public async Task<Result<ToggleLikeResponse>> Handle(ToggleLikeCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<ToggleLikeResponse>.Unauthorized();
        }

        var likerId = new UserId(userContext.UserId);

        // Check if target exists
        var targetAuthorId = await request.TargetType.GetTargetAuthorIdAsync(request.TargetId, postRepository, commentRepository, cancellationToken);
        if (targetAuthorId is not UserId validatedAuthorId)
        {
            return Result<ToggleLikeResponse>.NotFound("Target not found.");
        }

        if (!await interactionGuard.CanInteractAsync(likerId, request.TargetId, request.TargetType == LikeTargetType.Comment, cancellationToken))
        {
            return Result<ToggleLikeResponse>.NotFound("Target not found.");
        }

        // Check if like already exists
        var existingLike = await likeRepository.GetByUserAndTargetAsync(likerId, request.TargetId, request.TargetType, cancellationToken);

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

        return Result<ToggleLikeResponse>.Success(new ToggleLikeResponse(toggleResult.Action == LikeStatus.Liked));
    }
}
