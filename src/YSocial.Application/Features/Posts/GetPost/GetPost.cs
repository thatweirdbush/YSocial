using MediatR;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.GetPost;

public sealed record GetPostQuery(Guid PostId) : ResultQuery<PostInfo>;

internal sealed class GetPostQueryHandler(IPostRepository postRepository)
    : IRequestHandler<GetPostQuery, Result<PostInfo>>
{
    public async Task<Result<PostInfo>> Handle(GetPostQuery request, CancellationToken cancellationToken)
    {
        var post = Post.Create(UserId.New(), "Đây là method GET Post");
        var response = new PostInfo(
            post.Id.Value,
            post.Content,
            post.ImageUrl,
            post.CreatedAt,
            "Unknown");

        return Result<PostInfo>.Success(response);
    }
}
