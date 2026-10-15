namespace YSocial.Domain.Common.Errors;

/// <summary>
/// Stable error codes of the HTTP contract (renaming one is a contract change).
/// </summary>
public static class ErrorCodes
{
    #region Generic
    public const string ValidationFailed = nameof(ValidationFailed);
    public const string BusinessRuleViolated = nameof(BusinessRuleViolated);
    public const string Unauthenticated = nameof(Unauthenticated);
    public const string Forbidden = nameof(Forbidden);
    public const string NotFound = nameof(NotFound);
    public const string Conflict = nameof(Conflict);
    public const string InternalError = nameof(InternalError);
    #endregion

    #region Auth
    public const string InvalidCredentials = nameof(InvalidCredentials);
    public const string InvalidRefreshToken = nameof(InvalidRefreshToken);
    public const string AccountInactive = nameof(AccountInactive);
    public const string InvalidOtp = nameof(InvalidOtp);
    public const string OtpAttemptsExceeded = nameof(OtpAttemptsExceeded);
    #endregion

    #region Account & profile
    public const string EmailTaken = nameof(EmailTaken);
    public const string UsernameTaken = nameof(UsernameTaken);
    public const string ProfileNotOwned = nameof(ProfileNotOwned);
    public const string CannotDeleteDefaultProfile = nameof(CannotDeleteDefaultProfile);
    public const string AccountRequiresProfile = nameof(AccountRequiresProfile);
    public const string ProfileFieldInvalid = nameof(ProfileFieldInvalid);
    #endregion

    #region Post
    public const string NotPostAuthor = nameof(NotPostAuthor);
    public const string PostNotDeleted = nameof(PostNotDeleted);
    public const string PostContentInvalid = nameof(PostContentInvalid);
    #endregion

    #region Comment
    public const string NotCommentAuthor = nameof(NotCommentAuthor);
    public const string NotCommentAuthorOrPostOwner = nameof(NotCommentAuthorOrPostOwner);
    public const string NotCommentDeleter = nameof(NotCommentDeleter);
    public const string CommentsDisabled = nameof(CommentsDisabled);
    public const string PostDeleted = nameof(PostDeleted);
    public const string ParentCommentMismatch = nameof(ParentCommentMismatch);
    public const string CommentContentInvalid = nameof(CommentContentInvalid);
    public const string CommentNotDeleted = nameof(CommentNotDeleted);
    #endregion

    #region Graph
    public const string CannotFollowSelf = nameof(CannotFollowSelf);
    public const string CannotBlockSelf = nameof(CannotBlockSelf);
    public const string CloseFriendRequiresAcceptedFollow = nameof(CloseFriendRequiresAcceptedFollow);
    #endregion

    #region Notification
    public const string NotNotificationRecipient = nameof(NotNotificationRecipient);
    public const string NotificationContentInvalid = nameof(NotificationContentInvalid);
    #endregion
}
