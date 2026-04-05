using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.CreatePost;

public record CreatePostResponse(PostId PostId, UserId AuthorId, string Content, string? ImageUrl, DateTime CreatedAt);
