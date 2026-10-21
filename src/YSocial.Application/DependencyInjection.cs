using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using YSocial.Application.CQRS.Behaviors.Logging;
using YSocial.Application.CQRS.Behaviors.Metrics;
using YSocial.Application.CQRS.Behaviors.UnitOfWork;
using YSocial.Application.CQRS.Behaviors.Validation;

namespace YSocial.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        // Read-side access policy (D14, D15, D20)
        services.AddScoped<Features.Access.IViewerAccessPolicy, Features.Access.ViewerAccessPolicy>();
        services.AddScoped<Features.Users.Projection.UserProfileProjector>();
        services.AddScoped<Features.Posts.Projection.PostProjector>();
        services.AddScoped<Features.Access.InteractionGuard>();
        services.AddScoped<Features.UserRelations.GetFollowRequests.AccessibleFollowRequests>();
        services.AddScoped<Features.Notifications.NotificationPublisher>();
        services.AddScoped<Features.Notifications.AccessibleNotifications>();

        services.TryAddSingleton(TimeProvider.System);

        // Fluent Validation
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);

        // MediatR
        services.AddMediatR(cfg =>
        {
            // Register all MediatR handlers from the assembly
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly);

            // Register Pipeline Behaviors
            cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
            cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));
            cfg.AddOpenBehavior(typeof(MetricsBehavior<,>));
            cfg.AddOpenBehavior(typeof(TransactionBehavior<,>));
        });

        return services;
    }
}
