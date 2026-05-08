using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using YSocial.Api.Infrastructure.Serialization;
using YSocial.Api.Infrastructure.Swagger;
using YSocial.Application;
using YSocial.Application.Abstractions.Identity;
using YSocial.Infrastructure;

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<RouteOptions>(options =>
{
    options.LowercaseUrls = true;
});

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new EnumerationJsonConverterFactory());
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var secretKey = builder.Configuration["Jwt:SecretKey"] ?? "super-secret-key-that-should-be-long-enough-for-hs256!";
        var issuer = builder.Configuration["Jwt:Issuer"] ?? "YSocialApi";
        var audience = builder.Configuration["Jwt:Audience"] ?? "YSocialClient";

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = issuer,
            ValidAudience = audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey))
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

var app = builder.Build();

// Auto-generate admin token for development & attach to Swagger
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var jwtProvider = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
    
    // Get admin account
    var mockAccount = YSocial.Infrastructure.Data.MockDataStore.Accounts.Values.First(a => a.Email == "admin@admin.com");
    var adminToken = jwtProvider.GenerateToken(mockAccount.Id.Value, mockAccount.Email);
    
    // Log to terminal
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("\n=======================================================================\n" +
                          "DEVELOPMENT ADMIN TOKEN (admin@admin.com):\n" +
                          "{Token}\n" +
                          "=======================================================================\n", adminToken);

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

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.InjectJavascript("/swagger-custom.js");
    });
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
