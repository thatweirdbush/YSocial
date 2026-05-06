using Microservice.BuildingBlocks.Domain.Enumerations;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace YSocial.Api.Infrastructure.Serialization;

public class EnumerationJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        return IsEnumeration(typeToConvert);
    }

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var converterType = typeof(EnumerationJsonConverter<>).MakeGenericType(typeToConvert);
        return (JsonConverter)Activator.CreateInstance(converterType)!;
    }

    private static bool IsEnumeration(Type type)
    {
        var current = type;
        while (current != null && current != typeof(object))
        {
            if (current.IsGenericType && current.GetGenericTypeDefinition() == typeof(Enumeration<>))
            {
                return true;
            }
            current = current.BaseType;
        }
        return false;
    }
}

public class EnumerationJsonConverter<T> : JsonConverter<T>
{
    public override T? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number)
        {
            var value = reader.GetInt32();
            
            var method = EnumerationJsonConverterCache.FromValueMethods.GetOrAdd(typeToConvert, type =>
            {
                var baseType = type.BaseType;
                while (baseType != null && (!baseType.IsGenericType || baseType.GetGenericTypeDefinition() != typeof(Enumeration<>)))
                {
                    baseType = baseType.BaseType;
                }
                return baseType?.GetMethod("FromValue", BindingFlags.Public | BindingFlags.Static);
            });

            if (method != null)
            {
                var result = (T?)method.Invoke(null, [value]);
                return result == null ? throw new JsonException($"Invalid value '{value}' for enumeration '{typeToConvert.Name}'.") : result;
            }
        }
        else if (reader.TokenType == JsonTokenType.Null)
        {
            return default;
        }
        
        throw new JsonException($"Cannot convert JSON to {typeToConvert.Name}. Expected integer value.");
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
    {
        if (value != null)
        {
            var prop = EnumerationJsonConverterCache.ValueProperties.GetOrAdd(value.GetType(), type => type.GetProperty("Value"));
            if (prop != null)
            {
                writer.WriteNumberValue((int)prop.GetValue(value)!);
                return;
            }
        }
        writer.WriteNullValue();
    }
}
