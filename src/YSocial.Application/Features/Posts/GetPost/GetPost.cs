using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Posts.GetPost;

/// <summary>
/// Anonymous allowed. Deleted, hidden (privacy/visibility) & blocked posts are all 404 (§4.4).
/// </summary>
public sealed record GetPostQuery(Guid PostId) : ResultQuery<PostDto>;

internal sealed class GetPostQueryValidator : AbstractValidator<GetPostQuery>
{
    public GetPostQueryValidator()
    {
        RuleFor(x => x.PostId).NotEmpty();
    }
}

internal sealed class GetPostQueryHandler(IPostRepository postRepository, PostProjector projector, IUserContext userContext)
    : IRequestHandler<GetPostQuery, Result<PostDto>>
{
    public async Task<Result<PostDto>> Handle(GetPostQuery request, CancellationToken cancellationToken)
    {
        var post = await postRepository.GetByIdAsync(new PostId(request.PostId), cancellationToken);
        if (post is null)
        {
            return Result<PostDto>.NotFound("Post not found.");
        }

        var items = await projector.ProjectPostsAsync(userContext.GetViewerId(), [post], cancellationToken);

        return items.Count == 0 ? Result<PostDto>.NotFound("Post not found.") : Result<PostDto>.Success(items[0]);
    }
}
