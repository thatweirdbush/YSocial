using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Threads.GetThread;

/// <summary>
/// Thread of a post OR a comment id (D13), anonymous allowed. Requested item inaccessible = 404;
/// hidden parent = null (no stub); hidden replies are omitted and never counted.
/// </summary>
public sealed record GetThreadQuery(Guid Id) : ResultQuery<ThreadDto>;

internal sealed class GetThreadQueryValidator : AbstractValidator<GetThreadQuery>
{
    public GetThreadQueryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

internal sealed class GetThreadQueryHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    PostProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetThreadQuery, Result<ThreadDto>>
{
    public async Task<Result<ThreadDto>> Handle(GetThreadQuery request, CancellationToken cancellationToken)
    {
        // Typed lookups: a post id and a comment id are never confused
        var post = await postRepository.GetByIdAsync(new PostId(request.Id), cancellationToken);
        var comment = post is null ? await commentRepository.GetByIdAsync(new CommentId(request.Id), cancellationToken) : null;

        if (post is null && comment is null)
        {
            return NotFound();
        }

        var posts = new List<Post>();
        var comments = new List<Comment>();
        Guid? parentId = null;
        IReadOnlyList<Comment> replies;

        if (post is not null)
        {
            posts.Add(post);
            replies = await commentRepository.GetTopLevelByPostIdAsync(post.Id, cancellationToken);
        }
        else
        {
            comments.Add(comment!);
            var root = await postRepository.GetByIdAsync(comment!.PostId, cancellationToken);
            if (root is null)
            {
                return NotFound();
            }

            posts.Add(root); // inherited visibility; also the parent of a top-level comment

            if (comment.ParentCommentId is { } parentCommentId)
            {
                var parent = await commentRepository.GetByIdAsync(parentCommentId, cancellationToken);
                if (parent is not null) comments.Add(parent);
                parentId = parentCommentId.Value;
            }
            else
            {
                parentId = root.Id.Value;
            }

            replies = await commentRepository.GetChildrenAsync([comment.Id], cancellationToken);
        }

        var childReplies = replies.Count > 0
            ? await commentRepository.GetChildrenAsync(replies.Select(r => r.Id).ToList(), cancellationToken)
            : [];
        comments.AddRange(replies);
        comments.AddRange(childReplies);

        // One projection: the access policy drops whatever the viewer may not see
        var items = await projector.ProjectAsync(userContext.GetViewerId(), posts, comments, cancellationToken);

        if (!items.TryGetValue(request.Id, out var requested))
        {
            return NotFound();
        }

        var replyDtos = Newest(replies, items);
        var children = replyDtos.ToDictionary(
            reply => reply.Id,
            reply => (IReadOnlyList<PostDto>)Newest(childReplies.Where(c => c.ParentCommentId?.Value == reply.Id), items));

        var parentDto = parentId is { } id && items.TryGetValue(id, out var found) ? found : null;

        return Result<ThreadDto>.Success(new ThreadDto(requested, parentDto, replyDtos, children));
    }

    private static List<PostDto> Newest(IEnumerable<Comment> comments, IReadOnlyDictionary<Guid, PostDto> items)
        => comments
            .Where(c => items.ContainsKey(c.Id.Value))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => items[c.Id.Value])
            .ToList();

    private static Result<ThreadDto> NotFound() => Result<ThreadDto>.NotFound("Thread not found.");
}
