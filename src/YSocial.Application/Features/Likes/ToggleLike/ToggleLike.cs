using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
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
            .IsInEnum();
    }
}

internal sealed class ToggleLikeCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    ILikeRepository likeRepository,
    LikeToggleService likeToggleService,
    IUserContext userContext)
    : ICommandHandler<ToggleLikeCommand, Result<ToggleLikeResponse>>
{
    public async Task<Result<ToggleLikeResponse>> Handle(ToggleLikeCommand request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<ToggleLikeResponse>.Unauthorized();
        }

        var userId = new UserId(userContext.UserId);

        // Check if target exists
        if (request.TargetType == LikeTargetType.Post)
        {
            var postId = new PostId(request.TargetId);
            var post = await postRepository.GetByIdAsync(postId, cancellationToken);
            if (post is null) return Result<ToggleLikeResponse>.NotFound("Post not found.");
        }
        else if (request.TargetType == LikeTargetType.Comment)
        {
            var commentId = new CommentId(request.TargetId);
            var comment = await commentRepository.GetByIdAsync(commentId, cancellationToken);
            if (comment is null) return Result<ToggleLikeResponse>.NotFound("Comment not found.");
        }

        // Check if like already exists
        var existingLike = await likeRepository.GetByUserAndTargetAsync(userId, request.TargetId, request.TargetType, cancellationToken);

        var toggleResult = likeToggleService.ToggleLike(existingLike, request.TargetId, request.TargetType, userId);

        if (toggleResult.Action == LikeStatus.Unliked)
        {
            toggleResult.Like.Remove(); // Bắn event LikeRemovedEvent
            likeRepository.Remove(toggleResult.Like);
        }
        else
        {
            await likeRepository.AddAsync(toggleResult.Like, cancellationToken);
        }

        return Result<ToggleLikeResponse>.Success(new ToggleLikeResponse(toggleResult.Action == LikeStatus.Liked));
    }
}
