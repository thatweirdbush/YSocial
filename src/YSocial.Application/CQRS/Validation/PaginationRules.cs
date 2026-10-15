using FluentValidation;

namespace YSocial.Application.CQRS.Validation;

/// <summary>
/// Shared offset-pagination bounds (D16): page >= 1, 1 <= pageSize <= 50.
/// </summary>
public static class PaginationRules
{
    public const int MaxPageSize = 50;

    public static IRuleBuilderOptions<T, int> MustBeValidPage<T>(this IRuleBuilder<T, int> rule)
        => rule.GreaterThanOrEqualTo(1)
            .WithMessage("Page index must be greater than or equal to 1.");

    public static IRuleBuilderOptions<T, int> MustBeValidPageSize<T>(this IRuleBuilder<T, int> rule)
        => rule.InclusiveBetween(1, MaxPageSize)
            .WithMessage($"PageSize must be between 1 and {MaxPageSize} items.");
}
