using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using YSocial.Api.Infrastructure.Errors;
using YSocial.Api.Infrastructure.Serialization;
using YSocial.Api.Infrastructure.Swagger;
using YSocial.Application;
using YSocial.Application.Abstractions.Identity;
using YSocial.Infrastructure;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Notifications;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Seeding;

JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

var builder = WebApplication.CreateBuilder(args);

// Signing key: required outside Development (no fallback), a missing or short Jwt:SecretKey fails the startup
var jwtSettings = JwtSettings.FromConfiguration(builder.Configuration, builder.Environment.IsDevelopment());
builder.Services.AddSingleton(jwtSettings);

builder.Services.Configure<RouteOptions>(options =>
{
    options.LowercaseUrls = true;
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new EnumerationJsonConverterFactory());
    })
    .ConfigureApiBehaviorOptions(options =>
    {
        // Framework binding failures use the same envelope as validator failures
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(entry => entry.Value is { Errors.Count: > 0 })
                .GroupBy(entry => ApiProblems.ToFieldKey(entry.Key))
                .ToDictionary(
                    group => group.Key,
                    group => group.SelectMany(entry => entry.Value!.Errors)
                        .Select(error => string.IsNullOrEmpty(error.ErrorMessage) ? "The value is invalid." : error.ErrorMessage)
                        .ToArray());

            return ApiProblems.ToResult(context.HttpContext, StatusCodes.Status400BadRequest, "ValidationFailed",
                "One or more validation errors occurred.", errors);
        };
    });

builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context => ApiProblems.Enrich(context.HttpContext, context.ProblemDetails);
});
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey))
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // Read the token from the Query String sent by the SignalR Client
                var accessToken = context.Request.Query["access_token"];
                var path = context.Request.Path;

                // If the request is going to the Hub path, assign the Token to the Context
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Authorize setups
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter the token in the format: Bearer {your_token}"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });

    options.SchemaFilter<EnumerationSchemaFilter>();
});

builder.Services.AddHttpContextAccessor();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddPolicy("YSocialCorsPolicy", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Schema & seed. Migrate: Development default (opt in elsewhere). Seed holds well-known passwords: Development ONLY
await DatabaseInitializer.InitializeAsync(app.Services, new DatabaseInitOptions(
    Migrate: builder.Configuration.GetValue("Database:AutoMigrate", builder.Environment.IsDevelopment()),
    SeedData: builder.Environment.IsDevelopment() && builder.Configuration.GetValue("Database:SeedData", true)));

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    // Auto-generate admin token for development & attach to Swagger (convenience only: never blocks startup)
    var adminToken = await TryCreateDevelopmentAdminTokenAsync(app.Services);

    if (adminToken is not null)
    {
        // Serve script to auto-inject token to Swagger UI
        app.MapGet("/swagger-custom.js", () =>
        {
            var js = $$"""
            window.addEventListener("load", function() {
                setTimeout(function() {
                    var ui = window.ui;
                    if(ui) {
                        ui.authActions.authorize({
                            Bearer: {
                                name: "Bearer",
                                schema: {
                                    type: "http",
                                    scheme: "bearer",
                                    bearerFormat: "JWT",
                                    in: "header",
                                    name: "Authorization",
                                    description: "Enter the token in the format: Bearer {your_token}"
                                },
                                value: "{{adminToken}}"
                            }
                        });
                    }
                }, 1000);
            });
            """;
            return Results.Text(js, "application/javascript");
        });
    }

    // Configure Swagger
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.InjectJavascript("/swagger-custom.js");
    });

    // Redirect root URL to Swagger UI
    app.MapGet("/", () => Results.Redirect("/swagger"));
}

app.UseHttpsRedirection();

app.UseCors("YSocialCorsPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();

static async Task<string?> TryCreateDevelopmentAdminTokenAsync(IServiceProvider services)
{
    using var scope = services.CreateScope();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        var db = scope.ServiceProvider.GetRequiredService<YSocialDbContext>();
        var account = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Email == "admin@admin.com");
        var user = account is null ? null : await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.AccountId == account.Id);

        if (account is null || user is null)
        {
            logger.LogInformation("No development admin account (database not seeded): Swagger auto-authorize is off");
            return null;
        }

        var token = scope.ServiceProvider.GetRequiredService<IJwtProvider>().GenerateToken(user, account);

        logger.LogInformation("\n=======================================================================\n" +
                              "DEVELOPMENT ADMIN TOKEN (admin@admin.com):\n" +
                              "{Token}\n" +
                              "=======================================================================\n", token);

        return token;
    }
    catch (Exception exception)
    {
        logger.LogWarning(exception, "Could not create the development admin token (Swagger auto-authorize is off)");
        return null;
    }
}

public partial class Program;
