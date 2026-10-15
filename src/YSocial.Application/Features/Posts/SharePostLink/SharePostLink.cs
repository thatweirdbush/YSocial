using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Posts.SharePostLink;

/// <summary>
/// Shareable FE link of a post the viewer may see: <c>{BaseUrl}/posts/{postId}</c> (the FE post route).
/// Unknown, deleted or hidden posts answer 404.
/// </summary>
public sealed record SharePostLinkQuery(Guid PostId, string BaseUrl) : ResultQuery<SharePostLinkResponse>;

internal sealed class SharePostLinkQueryValidator : AbstractValidator<SharePostLinkQuery>
{
    public SharePostLinkQueryValidator()
    {
        RuleFor(x => x.PostId).NotEmpty();
    }
}

internal sealed class SharePostLinkQueryHandler(
    IPostRepository postRepository,
    IViewerAccessPolicy accessPolicy,
    IUserContext userContext)
    : IRequestHandler<SharePostLinkQuery, Result<SharePostLinkResponse>>
{
    public async Task<Result<SharePostLinkResponse>> Handle(SharePostLinkQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();
        var post = await postRepository.GetByIdAsync(new PostId(request.PostId), cancellationToken);

        if (post is null)
        {
            return Result<SharePostLinkResponse>.NotFound("Post not found.");
        }

        var context = await accessPolicy.GetContextAsync(viewerId, [post.AuthorId], cancellationToken);
        if (!context.IsPostAccessible(post))
        {
            return Result<SharePostLinkResponse>.NotFound("Post not found.");
        }

        var sharedUrl = $"{request.BaseUrl.TrimEnd('/')}/posts/{request.PostId}";

        return Result<SharePostLinkResponse>.Success(new SharePostLinkResponse(request.PostId, sharedUrl));
    }
}
