namespace YSocial.Application.Features.UserRelations.Follow;

/// <summary>
/// Follow outcome: <c>accepted</c> | <c>pending</c> (D8).
/// </summary>
public sealed record FollowUserResponse(string FollowStatus);
