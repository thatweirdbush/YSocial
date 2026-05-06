using System.Collections.Concurrent;
using System.Reflection;

namespace YSocial.Api.Infrastructure.Serialization;

internal static class EnumerationJsonConverterCache
{
    public static readonly ConcurrentDictionary<Type, MethodInfo?> FromValueMethods = new();
    public static readonly ConcurrentDictionary<Type, PropertyInfo?> ValueProperties = new();
}
