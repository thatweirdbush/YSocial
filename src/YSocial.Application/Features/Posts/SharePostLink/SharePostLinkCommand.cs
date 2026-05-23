using FluentValidation;
using MediatR;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;

namespace YSocial.Application.Features.Posts.SharePostLink;

public sealed record SharePostLinkCommand(Guid PostId, string AuthorUsername, string BaseUrl) : ResultCommand<SharePostLinkResponse>;

internal sealed class SharePostLinkCommandValidator : AbstractValidator<SharePostLinkCommand>
{
    public SharePostLinkCommandValidator()
    {
        RuleFor(x => x.PostId)
            .NotEmpty();

        RuleFor(x => x.AuthorUsername)
            .NotEmpty();
    }
}

internal sealed class SharePostLinkCommandHandler
    : IRequestHandler<SharePostLinkCommand, Result<SharePostLinkResponse>>
{
    public Task<Result<SharePostLinkResponse>> Handle(
        SharePostLinkCommand request,
        CancellationToken cancellationToken)
    {
        var cleanBaseUrl = request.BaseUrl.TrimEnd('/');
        var cleanUsername = request.AuthorUsername.Trim().Replace("@", "").ToLower();

        // Format: /@username/post/guid
        // e.g: https://ysocial.com/@admin/post/aacf8846-2af3-4b04-a3b8-94e1b066001d
        ///
        var sharedUrl = $"{cleanBaseUrl}/@{cleanUsername}/post/{request.PostId}";

        var response = new SharePostLinkResponse(request.PostId, sharedUrl);

        return Task.FromResult(Result<SharePostLinkResponse>.Success(response));
    }
}
