using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.AddComment;

/// <summary>
/// Creates a comment or reply (D12). Unknown / deleted / inaccessible post or parent = 404;
/// parent of another post = 400 ParentCommentMismatch.
/// </summary>
public sealed record AddCommentCommand(Guid PostId, string Content, Guid? ParentCommentId) : ResultCommand<PostDto>;

internal sealed class AddCommentCommandValidator : AbstractValidator<AddCommentCommand>
{
    public AddCommentCommandValidator()
    {
        RuleFor(x => x.PostId)
            .NotEmpty();

        RuleFor(x => x.Content)
            .NotEmpty();
    }
}

internal sealed class AddCommentCommandHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    CommentPostingService commentPostingService,
    PostProjector projector,
    IUserContext userContext)
    : ICommandHandler<AddCommentCommand, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(AddCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PostDto>.Unauthorized();
        }

        var authorId = new UserId(userContext.UserId);

        var post = await postRepository.GetByIdAsync(new PostId(command.PostId), cancellationToken);
        if (post is null || (await projector.ProjectPostsAsync(authorId, [post], cancellationToken)).Count == 0)
        {
            return Result<PostDto>.NotFound("Post not found.");
        }

        Comment? parent = null;
        if (command.ParentCommentId is { } parentId)
        {
            parent = await commentRepository.GetByIdAsync(new CommentId(parentId), cancellationToken);

            // Unknown, soft-deleted & inaccessible parents are indistinguishable
            if (parent is null || !(await projector.ProjectAsync(authorId, [], [parent], cancellationToken)).ContainsKey(parent.Id.Value))
            {
                return Result<PostDto>.NotFound("Parent comment not found.");
            }
        }

        // Domain: comments allowed + parent belongs to the same post
        var comment = commentPostingService.CreateComment(post, authorId, command.Content, parent);

        await commentRepository.AddAsync(comment, cancellationToken);

        var items = await projector.ProjectAsync(authorId, [], [comment], cancellationToken);

        return items.TryGetValue(comment.Id.Value, out var dto)
            ? Result<PostDto>.Success(dto)
            : Result<PostDto>.Unauthorized();
    }
}
