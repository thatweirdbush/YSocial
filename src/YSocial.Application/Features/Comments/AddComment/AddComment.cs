using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.AddComment;

public sealed record AddCommentCommand(Guid PostId, string Content, Guid? ParentCommentId) : ResultCommand<Guid>;

internal sealed class AddCommentCommandValidator : AbstractValidator<AddCommentCommand>
{
    public AddCommentCommandValidator()
    {
        RuleFor(x => x.PostId)
            .NotEmpty();

        RuleFor(x => x.Content)
            .NotNull()
            .NotEmpty();
    }
}

internal sealed class AddCommentCommandHandler(
    IPostRepository postRepository, 
    ICommentRepository commentRepository, 
    CommentPostingService commentPostingService,
    IUserContext userContext)
    : ICommandHandler<AddCommentCommand, Result<Guid>>
{
    public async Task<Result<Guid>> Handle(AddCommentCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<Guid>.Unauthorized();
        }

        var postId = new PostId(command.PostId);
        var postTask = postRepository.GetByIdAsync(postId, cancellationToken);

        CommentId? parentCommentId = command.ParentCommentId.HasValue 
            ? new CommentId(command.ParentCommentId.Value) 
            : null;

        var parentCommentTask = parentCommentId is not null
            ? commentRepository.GetByIdAsync(parentCommentId.Value, cancellationToken)
            : Task.FromResult<Comment?>(null);

        await Task.WhenAll(postTask, parentCommentTask);

        var post = postTask.Result;
        if (post is null)
        {
            return Result<Guid>.NotFound($"Post with ID {command.PostId} not found.");
        }

        if (parentCommentId is not null)
        {
            var parentComment = parentCommentTask.Result;
            if (parentComment is null)
            {
                return Result<Guid>.NotFound($"Parent comment with ID {command.ParentCommentId} not found.");
            }
        }

        var authorId = new UserId(userContext.UserId);
        var comment = commentPostingService.CreateComment(post, authorId, command.Content, parentCommentId);

        await commentRepository.AddAsync(comment, cancellationToken);

        return Result<Guid>.Success(comment.Id.Value);
    }
}
