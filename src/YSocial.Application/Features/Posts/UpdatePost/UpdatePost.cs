using FluentValidation;
using FluentValidation.Results;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.UpdatePost;

public sealed record UpdatePostCommand(Guid PostId, string Content) : ResultCommand<PostDto>;

internal sealed class UpdatePostCommandValidator : AbstractValidator<UpdatePostCommand>
{
    public UpdatePostCommandValidator()
    {
        RuleFor(command => command.PostId)
            .NotEmpty();

        // Emptiness depends on the post (a post with media may have no text): the handler & domain decide
        RuleFor(command => command.Content)
            .MaximumLength(2000);
    }
}

internal sealed class UpdatePostCommandHandler(IPostRepository postsRepository, PostProjector projector, IUserContext userContext)
    : ICommandHandler<UpdatePostCommand, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(UpdatePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PostDto>.Unauthorized();
        }

        var postId = new PostId(command.PostId);
        var post = await postsRepository.GetByIdWithHashtagsAsync(postId, cancellationToken);
        var editorId = new UserId(userContext.UserId);

        // Hidden/blocked posts do not reveal their existence to a non-author editor
        if (post is null || (await projector.ProjectPostsAsync(editorId, [post], cancellationToken)).Count == 0)
        {
            return Result<PostDto>.NotFound("Post not found.");
        }

        if (string.IsNullOrWhiteSpace(command.Content) && post.AuthorId == editorId && post.Media.Count == 0 && post.ImageUrl is null)
        {
            throw new ValidationException([new ValidationFailure(nameof(command.Content), "'Content' must not be empty.")]);
        }

        // Domain enforces OnlyAuthorCanPerformActionOnPostRule (403 NotPostAuthor)
        post.UpdateContent(editorId, command.Content);
        postsRepository.Update(post);

        var items = await projector.ProjectPostsAsync(editorId, [post], cancellationToken);

        return Result<PostDto>.Success(items[0]);
    }
}
