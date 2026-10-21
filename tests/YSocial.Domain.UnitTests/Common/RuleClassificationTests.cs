using FluentAssertions;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using System.Reflection;
using System.Runtime.CompilerServices;
using Xunit;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Common;

public class RuleClassificationTests
{
    private static readonly Assembly DomainAssembly = typeof(User).Assembly;

    private static IEnumerable<Type> RuleTypes => DomainAssembly.GetTypes()
        .Where(t => typeof(IBusinessRule).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false });

    private static string[] CatalogCodes => typeof(ErrorCodes)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Where(f => f.IsLiteral)
        .Select(f => (string)f.GetRawConstantValue()!)
        .ToArray();

    [Fact]
    public void AllRules_AreClassified()
    {
        var unclassified = RuleTypes.Where(t => !typeof(IClassifiedRule).IsAssignableFrom(t)).Select(t => t.Name).ToList();

        unclassified.Should().BeEmpty("every rule needs an explicit Code & Kind (D2)");
    }

    [Fact]
    public void AllRuleCodes_ExistInCatalog()
    {
        // Code & Kind must be constants: readable without constructing the rule
        foreach (var type in RuleTypes.Where(t => typeof(IClassifiedRule).IsAssignableFrom(t)))
        {
            var rule = (IClassifiedRule)RuntimeHelpers.GetUninitializedObject(type);

            CatalogCodes.Should().Contain(rule.Code, $"{type.Name} must use a catalog code");
            Enum.IsDefined(rule.Kind).Should().BeTrue();
        }
    }

    [Fact]
    public void CodesSnapshot_MatchesApprovedList()
    {
        // Renaming or removing a code is a contract change: update docs (MAP s1) with this list
        string[] approved =
        [
            "AccountInactive", "AccountRequiresProfile", "BusinessRuleViolated", "CannotBlockSelf", "CannotDeleteDefaultProfile",
            "CannotFollowSelf", "CannotMuteSelf", "CloseFriendRequiresAcceptedFollow", "CommentContentInvalid", "CommentNotDeleted", "CommentsDisabled",
            "Conflict", "EmailTaken", "Forbidden", "InternalError", "InvalidCredentials", "InvalidOtp", "InvalidRefreshToken", "MediaStorageUnavailable", "MethodNotAllowed",
            "NotCommentAuthor", "NotCommentAuthorOrPostOwner", "NotCommentDeleter", "NotFound", "NotNotificationRecipient",
            "NotPostAuthor", "NotificationContentInvalid", "OtpAttemptsExceeded", "ParentCommentMismatch", "PayloadTooLarge", "PostContentInvalid",
            "PostDeleted", "PostNotDeleted", "ProfileFieldInvalid", "ProfileNotOwned", "TooManyRequests", "Unauthenticated", "UnsupportedMediaType", "UsernameTaken",
            "ValidationFailed"
        ];

        CatalogCodes.OrderBy(c => c, StringComparer.Ordinal).Should().Equal(approved);
    }
}
