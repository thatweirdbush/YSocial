using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Media;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.CreatePost;

/// <param name="ImageUrl">External image (e.g. GIF picker); never together with <paramref name="MediaIds"/>, never a url of our own storage.</param>
/// <param name="MediaIds">Own Pending post assets in display order (at most 10, distinct).</param>
public sealed record CreatePostCommand(string Content, string? ImageUrl, IReadOnlyList<Guid>? MediaIds = null) : ResultCommand<PostDto>;

internal sealed partial class CreatePostCommandValidator : AbstractValidator<CreatePostCommand>
{
    private const int MaxContentLength = 2000;
    private const int MaxImageUrlLength = 2048;
    private const int MaxMedia = 10;

    public CreatePostCommandValidator(IMediaStorage storage)
    {
        // Text may be empty only when something else is posted (uploaded media or an external image)
        RuleFor(command => command.Content)
            .NotEmpty()
            .When(command => command.ImageUrl is null && (command.MediaIds is null || command.MediaIds.Count == 0));

        RuleFor(command => command.Content).MaximumLength(MaxContentLength);

        RuleFor(command => command.ImageUrl)
            .MaximumLength(MaxImageUrlLength)
            .Must(BeAbsoluteHttpUrl)
            .WithMessage("'Image Url' must be an absolute http(s) URL.")
            .Must(url => !storage.OwnsUrl(url))
            .WithMessage("'Image Url' cannot point at our own media storage: upload the file and send 'mediaIds'.")
            .Must((command, _) => command.MediaIds is null || command.MediaIds.Count == 0)
            .WithMessage("Send either 'imageUrl' or 'mediaIds', not both.")
            .When(command => command.ImageUrl is not null);

        RuleFor(command => command.MediaIds)
            .Must(ids => ids!.Count <= MaxMedia)
            .WithMessage($"A post can carry at most {MaxMedia} media items.")
            .Must(ids => ids!.Distinct().Count() == ids!.Count)
            .WithMessage("'Media Ids' must be distinct.")
            .Must(ids => ids!.All(id => id != Guid.Empty))
            .WithMessage("'Media Ids' must be valid ids.")
            .When(command => command.MediaIds is not null);
    }

    private static bool BeAbsoluteHttpUrl(string? url)
        => Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}

internal sealed class CreatePostCommandHandler(
    IPostRepository postsRepository,
    IMediaAssetRepository mediaRepository,
    PostProjector projector,
    IUserContext userContext)
    : ICommandHandler<CreatePostCommand, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(CreatePostCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PostDto>.Unauthorized();
        }

        var authorId = new UserId(userContext.UserId);
        var imageUrl = command.ImageUrl;
        var media = new List<PostMedia>();

        if (command.MediaIds is { Count: > 0 } mediaIds)
        {
            var assets = await mediaRepository.GetByIdsAsync(mediaIds.Select(id => new MediaAssetId(id)).ToList(), cancellationToken);

            // One answer for foreign, unknown, used and wrong-purpose assets; nothing is attached unless ALL are fine
            if (assets.Count != mediaIds.Count)
            {
                return Result<PostDto>.NotFound("Resource not found.");
            }

            var byId = assets.ToDictionary(asset => asset.Id.Value);

            foreach (var id in mediaIds)
            {
                var asset = byId[id];
                asset.MarkAttached(authorId, MediaPurpose.Post);
                media.Add(PostMedia.Create(asset.Id, asset.Kind, asset.Url!, asset.PosterUrl, asset.Width!.Value, asset.Height!.Value, asset.DurationSeconds, asset.Bytes!.Value));
            }

            // Legacy single-image field: first uploaded image
            imageUrl = media.FirstOrDefault(m => m.Kind == MediaKind.Image)?.Url;
        }

        // Post insert and every attach transition share the one save of the pipeline; a concurrent attach of the same asset loses on its token (409)
        var post = Post.Create(authorId, command.Content, imageUrl, media: media);

        await postsRepository.AddAsync(post, cancellationToken);

        var items = await projector.ProjectPostsAsync(authorId, [post], cancellationToken);

        // Author profile deleted while the token is still valid: nothing to show
        return items.Count == 0 ? Result<PostDto>.Unauthorized() : Result<PostDto>.Success(items[0]);
    }
}
