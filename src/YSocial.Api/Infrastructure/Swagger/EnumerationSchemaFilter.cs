using Microservice.BuildingBlocks.Domain.Enumerations;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Reflection;

namespace YSocial.Api.Infrastructure.Swagger;

public class EnumerationSchemaFilter : ISchemaFilter
{
    public void Apply(OpenApiSchema schema, SchemaFilterContext context)
    {
        var type = context.Type;
        
        if (IsEnumeration(type))
        {
            schema.Type = "integer";
            schema.Enum.Clear();
            
            var baseType = type.BaseType;
            while (baseType != null && (!baseType.IsGenericType || baseType.GetGenericTypeDefinition() != typeof(Enumeration<>)))
            {
                baseType = baseType.BaseType;
            }

            if (baseType != null)
            {
                var method = baseType.GetMethod("GetAll", BindingFlags.Public | BindingFlags.Static);
                if (method != null)
                {
                    var values = (IEnumerable<object>?)method.Invoke(null, null);
                    if (values != null)
                    {
                        var descriptions = new List<string>();
                        foreach (var val in values)
                        {
                            var propValue = val.GetType().GetProperty("Value")?.GetValue(val);
                            var propName = val.GetType().GetProperty("Name")?.GetValue(val);
                            
                            if (propValue != null)
                            {
                                schema.Enum.Add(new OpenApiInteger((int)propValue));
                                descriptions.Add($"{propValue} = {propName}");
                            }
                        }
                        
                        schema.Description = string.Join(", ", descriptions);
                    }
                }
            }
        }
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
