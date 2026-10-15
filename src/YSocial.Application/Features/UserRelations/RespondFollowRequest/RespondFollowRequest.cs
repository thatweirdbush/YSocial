using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.RespondFollowRequest;

/// <summary>
/// Accept or decline a pending request addressed to the viewer. Accept notifies the requester; decline soft-deletes the edge
/// (no event, no count change). No pending request (or inaccessible requester) = 404.
/// </summary>
/// <param name="Decision"><c>accept</c> | <c>decline</c>.</param>
public sealed record RespondFollowRequestCommand(Guid RequesterId, string Decision) : ResultCommand;

internal sealed class RespondFollowRequestCommandValidator : AbstractValidator<RespondFollowRequestCommand>
{
    public RespondFollowRequestCommandValidator()
    {
        RuleFor(x => x.RequesterId).NotEmpty();

        RuleFor(x => x.Decision)
            .Must(d => d is "accept" or "decline")
            .WithMessage("Decision must be 'accept' or 'decline'.");
    }
}

internal sealed class RespondFollowRequestCommandHandler(
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy,
    IUserContext userContext)
    : ICommandHandler<RespondFollowRequestCommand, Result>
{
    public async Task<Result> Handle(RespondFollowRequestCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result.Unauthorized();
        }

        var requesterId = new UserId(request.RequesterId);
        var edge = await relationRepository.GetRelationAsync(requesterId, viewerId, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, [requesterId], cancellationToken);

        if (edge is null || edge.FollowStatus != FollowStatus.Pending || !context.IsDiscoverable(requesterId))
        {
            return Result.NotFound("Follow request not found.");
        }

        if (request.Decision == "accept")
        {
            edge.AcceptFollow();
        }
        else
        {
            edge.Delete();
        }

        relationRepository.Update(edge);

        return Result.Success();
    }
}
