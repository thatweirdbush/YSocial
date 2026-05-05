namespace YSocial.Api.Models.Comments;

public sealed record AddCommentRequest(Guid PostId, string Content, Guid? ParentCommentId);
