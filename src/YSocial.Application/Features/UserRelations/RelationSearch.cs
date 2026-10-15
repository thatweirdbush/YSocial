using FluentValidation;
using System.Globalization;
using System.Text;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations;

/// <summary>
/// Shared relation-list search rule (follow requests, followers/following, mutes): trimmed, max 50 chars,
/// substring of username OR display name, case- and diacritics-insensitive, applied after the access filter and before paging.
/// </summary>
public static class RelationSearch
{
    public const int MaxQueryLength = 50;

    public static IRuleBuilderOptions<T, string?> MustBeValidRelationQuery<T>(this IRuleBuilder<T, string?> rule)
        => rule.Must(query => query is null || query.Trim().Length <= MaxQueryLength)
            .WithMessage($"Query must be at most {MaxQueryLength} characters.");

    /// <summary>
    /// Lower-cases and strips combining marks (Vietnamese <c>đ</c> has no decomposition, mapped explicitly).
    /// </summary>
    public static string Normalize(string? text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;

        var decomposed = text.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);

        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            builder.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        }

        return builder.ToString();
    }

    public static IReadOnlyList<User> Filter(IEnumerable<User> users, string? query)
    {
        var needle = Normalize(query);
        if (needle.Length == 0) return users.ToList();

        return users
            .Where(u => Normalize(u.Username).Contains(needle) || Normalize(u.ProfileInfo.DisplayName).Contains(needle))
            .ToList();
    }
}
