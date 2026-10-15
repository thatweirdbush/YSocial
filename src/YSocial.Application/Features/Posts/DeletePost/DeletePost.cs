using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.DeletePost;

public sealed record DeletePostCommand(Guid PostId) : ResultCommand;

internal sealed class DeletePostCommandValidator : AbstractValidator<DeletePostCommand>
{
    public DeletePostCommandValidator()
    {
        RuleFor(command => command.PostId).NotEmpty();
    }
}

internal sealed class DeletePostCommandHandler(IPostRepository postsRepository, IUserContext userContext)
    : ICommandHandler<DeletePostCommand, Result>
{
    public async Task<Result> Handle(DeletePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        var postId = new PostId(command.PostId);
        var post = await postsRepository.GetByIdAsync(postId, cancellationToken);

        if (post is null)
        {
            return Result.NotFound($"Post with ID {command.PostId} not found.");
        }

        var editorId = new UserId(userContext.UserId);
        post.Delete(editorId);
        postsRepository.Update(post);

        return Result.Success();
    }
}
