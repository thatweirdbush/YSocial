using System.Linq.Expressions;
using Microservice.BuildingBlocks.Domain.Enumerations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using YSocial.Domain.Countries;

namespace YSocial.Infrastructure.Persistence.Conversions;

/// <summary>
/// Strongly-typed id (generated struct with <c>Value</c> & <c>(Guid)</c> ctor) to <see cref="Guid"/> column.
/// </summary>
internal sealed class StronglyTypedIdConverter<TId>() : ValueConverter<TId, Guid>(ToProvider, FromProvider)
    where TId : struct
{
    private static readonly Expression<Func<TId, Guid>> ToProvider = BuildToProvider();
    private static readonly Expression<Func<Guid, TId>> FromProvider = BuildFromProvider();

    private static Expression<Func<TId, Guid>> BuildToProvider()
    {
        var id = Expression.Parameter(typeof(TId), "id");
        return Expression.Lambda<Func<TId, Guid>>(Expression.Property(id, "Value"), id);
    }

    private static Expression<Func<Guid, TId>> BuildFromProvider()
    {
        var value = Expression.Parameter(typeof(Guid), "value");
        var ctor = typeof(TId).GetConstructor([typeof(Guid)])
                   ?? throw new InvalidOperationException($"{typeof(TId).Name} has no (Guid) constructor.");
        return Expression.Lambda<Func<Guid, TId>>(Expression.New(ctor, value), value);
    }
}

/// <summary>
/// <see cref="Enumeration{T}"/> with an int <c>Value</c> to int column (unknown value maps to <c>null</c>, i.e. fails loudly on materialization).
/// </summary>
internal sealed class EnumerationConverter<T>() : ValueConverter<T, int>(ToProvider, FromProvider)
    where T : Enumeration<T>
{
    private static readonly Expression<Func<T, int>> ToProvider = BuildToProvider();
    private static readonly Expression<Func<int, T>> FromProvider = value => Enumeration<T>.FromValue(value)!;

    private static Expression<Func<T, int>> BuildToProvider()
    {
        var item = Expression.Parameter(typeof(T), "item");
        return Expression.Lambda<Func<T, int>>(Expression.Property(item, "Value"), item);
    }
}

/// <summary>
/// <see cref="Country"/> (has no int value) to ISO code column.
/// </summary>
internal sealed class CountryConverter() : ValueConverter<Country, string>(
    country => country.ISO,
    iso => Country.GetAll().First(c => c.ISO == iso));

/// <summary>
/// Every <see cref="DateTime"/> is UTC: written as UTC, read back flagged UTC (SQLite & legacy columns lose the kind).
/// </summary>
internal sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    value => value.ToUniversalTime(),
    value => DateTime.SpecifyKind(value, DateTimeKind.Utc));

/// <summary>
/// Calendar date without time zone (date of birth): no shifting.
/// </summary>
internal sealed class DateOnlyDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    value => DateTime.SpecifyKind(value.Date, DateTimeKind.Unspecified),
    value => DateTime.SpecifyKind(value.Date, DateTimeKind.Unspecified));
