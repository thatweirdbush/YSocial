using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.ToggleLike;

public sealed record ToggleLikeCommand(Guid UserId, Guid PostId) : ResultCommand<ToggleLikeResponse>;

internal sealed class ToggleLikeCommandValidator : AbstractValidator<ToggleLikeCommand>
{
    public ToggleLikeCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.PostId).NotEmpty();
    }
}

internal sealed class ToggleLikeCommandHandler(ILikeRepository likeRepository, LikeToggleService likeToggleService)
    : ICommandHandler<ToggleLikeCommand, Result<ToggleLikeResponse>>
{
    public async Task<Result<ToggleLikeResponse>> Handle(ToggleLikeCommand request, CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var postId = new PostId(request.PostId);

        var existingLike = await likeRepository.GetByUserAndPostAsync(userId, postId, cancellationToken);

        var toggleResult = likeToggleService.ToggleLike(existingLike, postId, userId);

        if (toggleResult.Action == LikeStatus.Unliked)
        {
            likeRepository.Remove(toggleResult.Like);
        }
        else
        {
            await likeRepository.AddAsync(toggleResult.Like, cancellationToken);
        }

        return Result<ToggleLikeResponse>.Success(new ToggleLikeResponse(toggleResult.Action == LikeStatus.Liked));
    }
}
