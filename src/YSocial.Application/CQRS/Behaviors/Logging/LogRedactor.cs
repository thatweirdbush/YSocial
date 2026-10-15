using System.Collections;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text;

namespace YSocial.Application.CQRS.Behaviors.Logging;

/// <summary>
/// Marks a property whose value must never reach a log (passwords, OTPs, tokens...).
/// Property names containing password, otp, token or secret are redacted even without the attribute.
/// </summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class SensitiveDataAttribute : Attribute;

/// <summary>
/// Renders request and response objects for logs with sensitive members replaced by <see cref="Mask"/>.
/// The compiler-generated record <c>ToString()</c> prints every member, so requests are NEVER logged through it.
/// </summary>
public static class LogRedactor
{
    public const string Mask = "***";

    private const int MaxDepth = 3;
    private static readonly string[] SensitiveNameParts = ["password", "otp", "token", "secret"];
    private static readonly ConcurrentDictionary<Type, PropertyInfo[]> Properties = new();

    public static string Describe(object? value)
    {
        var builder = new StringBuilder();
        Append(builder, value, 0);
        return builder.ToString();
    }

    public static bool IsSensitive(PropertyInfo property)
        => property.IsDefined(typeof(SensitiveDataAttribute), inherit: true)
           || SensitiveNameParts.Any(part => property.Name.Contains(part, StringComparison.OrdinalIgnoreCase));

    private static object? ReadValue(PropertyInfo property, object instance)
    {
        try
        {
            return property.GetValue(instance);
        }
        catch (TargetInvocationException)
        {
            return "<unavailable>"; // e.g. Result<T>.Value of a failed result
        }
    }

    private static void Append(StringBuilder builder, object? value, int depth)
    {
        switch (value)
        {
            case null:
                builder.Append("null");
                return;
            case string or char or bool or Enum or Guid or DateTime or DateTimeOffset or TimeSpan:
            case { } when value.GetType().IsPrimitive || value is decimal:
                builder.Append(value);
                return;
            case IEnumerable items when depth < MaxDepth:
                builder.Append('[');
                var first = true;
                foreach (var item in items)
                {
                    if (!first) builder.Append(", ");
                    first = false;
                    Append(builder, item, depth + 1);
                }

                builder.Append(']');
                return;
        }

        var type = value.GetType();
        if (depth >= MaxDepth)
        {
            builder.Append(type.Name);
            return;
        }

        builder.Append(type.Name).Append(" { ");
        var properties = Properties.GetOrAdd(type, t => t
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Where(p => p.GetIndexParameters().Length == 0 && p.CanRead)
            .ToArray());

        for (var i = 0; i < properties.Length; i++)
        {
            if (i > 0) builder.Append(", ");
            builder.Append(properties[i].Name).Append(" = ");

            if (IsSensitive(properties[i]))
            {
                builder.Append(Mask);
                continue;
            }

            Append(builder, ReadValue(properties[i], value), depth + 1);
        }

        builder.Append(" }");
    }
}
