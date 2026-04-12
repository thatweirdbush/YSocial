using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.CreatePost;

public sealed record CreatePostCommand(string Content, string? ImageUrl) : ResultCommand<CreatePostResponse>;

internal sealed partial class CreatePostCommandValidator : AbstractValidator<CreatePostCommand>
{
    public CreatePostCommandValidator()
    {
        RuleFor(command => command.Content)
            .NotNull()
            .NotEmpty();

        RuleFor(command => command.ImageUrl)
            .NotNull()
            .NotEmpty();
    }
}

internal sealed class CreatePostCommandHandler(IPostRepository postsRepository)
    : ICommandHandler<CreatePostCommand, Result<CreatePostResponse>>
{
    public async Task<Result<CreatePostResponse>> Handle(CreatePostCommand command, CancellationToken cancellationToken)
    {
        var post = Post.Create(UserId.New(), "Welcome to YSocial!");
        //await postsRepository.AddAsync(post, cancellationToken);
        var resp = new CreatePostResponse(
            post.Id,
            post.AuthorId,
            post.Content,
            post.ImageUrl,
            post.CreatedAt);

        return Result<CreatePostResponse>.Success(resp);
    }
}