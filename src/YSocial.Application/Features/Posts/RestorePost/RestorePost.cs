using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.RestorePost;

public sealed record RestorePostCommand(Guid PostId) : ResultCommand;

internal sealed class RestorePostCommandValidator : AbstractValidator<RestorePostCommand>
{
    public RestorePostCommandValidator()
    {
        RuleFor(command => command.PostId).NotEmpty();
    }
}

internal sealed class RestorePostCommandHandler(IPostRepository postsRepository, InteractionGuard guard, IUserContext userContext)
    : ICommandHandler<RestorePostCommand, Result>
{
    public async Task<Result> Handle(RestorePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var postId = new PostId(command.PostId);

        // We set includeDeleted: true because the post we want to restore is currently soft-deleted.
        var post = await postsRepository.GetByIdAsync(postId, includeDeleted: true, cancellationToken);

        if (post is null)
        {
            return Result.NotFound("Resource not found.");
        }

        var editorId = new UserId(userContext.UserId);
        if (await guard.IsPostHiddenFromAsync(editorId, post, cancellationToken))
        {
            return Result.NotFound("Resource not found.");
        }

        post.Restore(editorId);
        postsRepository.Update(post);

        return Result.Success();
    }
}
