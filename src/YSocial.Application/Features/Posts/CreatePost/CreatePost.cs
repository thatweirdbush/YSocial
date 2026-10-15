using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.CreatePost;

public sealed record CreatePostCommand(string Content, string? ImageUrl) : ResultCommand<PostDto>;

internal sealed partial class CreatePostCommandValidator : AbstractValidator<CreatePostCommand>
{
    private const int MaxContentLength = 2000;
    private const int MaxImageUrlLength = 2048;

    public CreatePostCommandValidator()
    {
        RuleFor(command => command.Content)
            .NotEmpty()
            .MaximumLength(MaxContentLength);

        // Optional single media URL (no upload endpoint, D18)
        RuleFor(command => command.ImageUrl)
            .MaximumLength(MaxImageUrlLength)
            .Must(BeAbsoluteHttpUrl)
            .WithMessage("'Image Url' must be an absolute http(s) URL.")
            .When(command => command.ImageUrl is not null);
    }

    private static bool BeAbsoluteHttpUrl(string? url)
        => Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}

internal sealed class CreatePostCommandHandler(IPostRepository postsRepository, PostProjector projector, IUserContext userContext)
    : ICommandHandler<CreatePostCommand, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(CreatePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PostDto>.Unauthorized();
        }

        var authorId = new UserId(userContext.UserId);
        var post = Post.Create(authorId, command.Content, command.ImageUrl);

        await postsRepository.AddAsync(post, cancellationToken);

        var items = await projector.ProjectPostsAsync(authorId, [post], cancellationToken);

        // Author profile deleted while the token is still valid: nothing to show
        return items.Count == 0 ? Result<PostDto>.Unauthorized() : Result<PostDto>.Success(items[0]);
    }
}
