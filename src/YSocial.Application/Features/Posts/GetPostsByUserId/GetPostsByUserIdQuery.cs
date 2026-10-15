using FluentValidation;
using MediatR;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.GetPostsByUserId;

public sealed record GetPostsByUserIdQuery(Guid UserId, int Page, int PageSize) : ResultQuery<PagedList<PostInfo>>;

internal sealed class GetPostsByUserIdQueryValidator : AbstractValidator<GetPostsByUserIdQuery>
{
    public GetPostsByUserIdQueryValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty();

        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetPostsByUserIdQueryHandler(IPostRepository postRepository)
    : IRequestHandler<GetPostsByUserIdQuery, Result<PagedList<PostInfo>>>
{
    public async Task<Result<PagedList<PostInfo>>> Handle(
        GetPostsByUserIdQuery request,
        CancellationToken cancellationToken)
    {
        var targetUserId = new UserId(request.UserId);

        var (posts, totalCount) = await postRepository.GetByUserIdPagedAsync(
            targetUserId,
            request.Page,
            request.PageSize,
            cancellationToken);

        var postInfos = posts.Select(post => new PostInfo(
            post.Id.Value,
            post.Content,
            post.ImageUrl,
            post.CreatedAt,
            post.AuthorId.Value,
            post.AuthorId.Value.ToString()
        )).ToList();

        var response = new PagedList<PostInfo>(
            postInfos,
            request.Page,
            request.PageSize,
            totalCount);

        return Result<PagedList<PostInfo>>.Success(response);
    }
}
