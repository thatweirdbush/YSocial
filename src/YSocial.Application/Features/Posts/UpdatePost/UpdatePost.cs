using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.UpdatePost;

public sealed record UpdatePostCommand(Guid PostId, string Content) : ResultCommand<bool>;

internal sealed class UpdatePostCommandValidator : AbstractValidator<UpdatePostCommand>
{
    public UpdatePostCommandValidator()
    {
        RuleFor(command => command.PostId)
            .NotEmpty();

        RuleFor(command => command.Content)
            .NotNull()
            .NotEmpty();
    }
}

internal sealed class UpdatePostCommandHandler(IPostRepository postsRepository, IUserContext userContext)
    : ICommandHandler<UpdatePostCommand, Result<bool>>
{
    public async Task<Result<bool>> Handle(UpdatePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<bool>.Unauthorized();
        }

        var postId = new PostId(command.PostId);
        var post = await postsRepository.GetByIdAsync(postId, cancellationToken);

        if (post is null)
        {
            return Result<bool>.NotFound($"Post with ID {command.PostId} not found.");
        }

        // Domain Model's UpdateContent enforces OnlyAuthorCanEditPostRule internally, 
        // but it requires us to pass the editor's UserId.
        var editorId = new UserId(userContext.UserId);
        
        post.UpdateContent(editorId, command.Content);
        postsRepository.Update(post);

        return Result<bool>.Success(true);
    }
}
