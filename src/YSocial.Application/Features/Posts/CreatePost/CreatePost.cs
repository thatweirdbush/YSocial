using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.CreatePost;

public sealed record CreatePostCommand(string Content, string? ImageUrl) : ResultCommand<CreatePostResponse>;

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

internal sealed class CreatePostCommandHandler(IPostRepository postsRepository, IUserContext userContext)
    : ICommandHandler<CreatePostCommand, Result<CreatePostResponse>>
{
    public async Task<Result<CreatePostResponse>> Handle(CreatePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<CreatePostResponse>.Unauthorized();
        }

        var authorId = new UserId(userContext.UserId);
        var post = Post.Create(authorId, command.Content, command.ImageUrl);
        
        var resp = new CreatePostResponse(
            post.Id,
            post.AuthorId,
            post.Content,
            post.ImageUrl,
            post.CreatedAt);

        await postsRepository.AddAsync(post, cancellationToken);

        return Result<CreatePostResponse>.Success(resp);
    }
}
