using FluentValidation;
using MediatR;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Posts.GetPost;

public sealed record GetPostQuery(Guid PostId) : ResultQuery<PostInfo>;

internal sealed class GetPostQueryValidator : AbstractValidator<GetPostQuery>
{
    public GetPostQueryValidator()
    {
        RuleFor(x => x.PostId).NotEmpty();
    }
}

internal sealed class GetPostQueryHandler(IPostRepository postRepository)
    : IRequestHandler<GetPostQuery, Result<PostInfo>>
{
    public async Task<Result<PostInfo>> Handle(GetPostQuery request, CancellationToken cancellationToken)
    {
        var postId = new PostId(request.PostId);
        var post = await postRepository.GetByIdAsync(postId, cancellationToken);

        if (post is null)
        {
            return Result<PostInfo>.NotFound($"Post with ID {request.PostId} not found.");
        }

        var response = new PostInfo(
            post.Id.Value,
            post.Content,
            post.ImageUrl,
            post.CreatedAt,
            post.AuthorId.Value,
            post.AuthorId.Value.ToString());

        return Result<PostInfo>.Success(response);
    }
}
