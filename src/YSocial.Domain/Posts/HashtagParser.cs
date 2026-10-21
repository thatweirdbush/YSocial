using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace YSocial.Domain.Posts;

/// <summary>
/// Extracts hashtags exactly like the FE (<c>lib/text.ts</c>): same pattern, same fold. Parity is pinned by
/// the shared golden fixture <c>docs/fixtures/hashtag-parity.json</c>.
/// </summary>
public static partial class HashtagParser
{
    /// <summary>
    /// Max tag length in UTF-16 code units of the raw match (same unit as JS <c>String.length</c>).
    /// </summary>
    public const int MaxTagLength = 50;

    public const int MaxTagsPerPost = 30;

    // '#' at start or after whitespace (U+FEFF is whitespace in JS, not in .NET), then letters, marks, digits, '_'
    [GeneratedRegex(@"(?<=^|[\s﻿])#([\p{L}\p{M}\p{N}_]+)")]
    private static partial Regex TagPattern();

    /// <summary>
    /// Folded match key: NFD, marks dropped, <c>đ</c> -> <c>d</c>, lowercase.
    /// </summary>
    public static string Fold(string tag)
    {
        var builder = new StringBuilder(tag.Length);

        foreach (var c in tag.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) is UnicodeCategory.NonSpacingMark or UnicodeCategory.SpacingCombiningMark or UnicodeCategory.EnclosingMark)
            {
                continue;
            }

            builder.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        }

        return builder.ToString();
    }

    /// <summary>
    /// Distinct tags in order of appearance (first casing wins); over-long tags are skipped, at most <see cref="MaxTagsPerPost"/> kept.
    /// </summary>
    public static IReadOnlyList<(string Key, string Display)> Extract(string content)
    {
        var tags = new List<(string Key, string Display)>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (Match match in TagPattern().Matches(content))
        {
            var display = match.Groups[1].Value;
            if (display.Length > MaxTagLength) continue;

            var key = Fold(display);
            if (key.Length == 0 || !seen.Add(key)) continue;

            tags.Add((key, display));
            if (tags.Count == MaxTagsPerPost) break;
        }

        return tags;
    }
}
