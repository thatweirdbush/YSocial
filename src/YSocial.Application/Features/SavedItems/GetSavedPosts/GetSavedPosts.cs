using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.SavedItems.GetSavedPosts;

public sealed record SavedPostResponse(Guid Id, Guid AuthorId, string Content, string? ImageUrl, DateTime CreatedAt, int LikeCount, int SavedCount);

public sealed record GetSavedPostsQuery() : ResultQuery<List<SavedPostResponse>>;

internal sealed class GetSavedPostsQueryHandler(
    ISavedItemRepository savedItemRepository,
    IPostRepository postRepository,
    IUserContext userContext)
    : IRequestHandler<GetSavedPostsQuery, Result<List<SavedPostResponse>>>
{
    public async Task<Result<List<SavedPostResponse>>> Handle(GetSavedPostsQuery request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<List<SavedPostResponse>>.Unauthorized();
        }

        var userId = new UserId(userContext.UserId);

        var savedItems = await savedItemRepository.GetSavedItemsByUserAsync(userId, SavedItemTargetType.Post, cancellationToken);

        var posts = new List<SavedPostResponse>();
        
        // This is a naive implementation for mock store, a real db would join to get everything efficiently
        foreach (var savedItem in savedItems)
        {
            var postId = new PostId(savedItem.TargetId);
            var post = await postRepository.GetByIdAsync(postId, cancellationToken);
            
            if (post is not null && !post.IsDeleted)
            {
                posts.Add(new SavedPostResponse(
                    post.Id.Value,
                    post.AuthorId.Value,
                    post.Content,
                    post.ImageUrl,
                    post.CreatedAt,
                    post.LikeCount,
                    post.SavedCount));
            }
        }

        return Result<List<SavedPostResponse>>.Success(posts);
    }
}
