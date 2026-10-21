using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Abstractions.Messaging;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Comments;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Media;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Media;
using YSocial.Infrastructure.Messaging;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Notifications;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Database (connection string resolved lazily: hosts/tests may replace the provider before first use)
        services.AddDbContext<YSocialDbContext>((serviceProvider, options) =>
        {
            var connectionString = ConnectionStrings.Normalize(
                serviceProvider.GetRequiredService<IConfiguration>().GetConnectionString("DefaultConnection"));

            options.UseNpgsql(connectionString, npgsql => npgsql
                .EnableRetryOnFailure()
                .UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery));
        });

        // Repositories
        services.AddScoped<IPostRepository, PostRepository>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<ILikeRepository, LikeRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<ICommentRepository, CommentRepository>();
        services.AddScoped<ISavedItemRepository, SavedItemRepository>();
        services.AddScoped<IUserRelationRepository, UserRelationRepository>();
        services.AddScoped<IUserBlockRepository, UserBlockRepository>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<IMediaAssetRepository, MediaAssetRepository>();

        services.AddScoped<IUserContext, UserContext>();
        services.AddSingleton<IJwtProvider, JwtProvider>();
        services.AddSingleton<IAccountSessionLock, AccountSessionLock>();
        services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();

        // Media storage: Cloudinary when all 3 keys exist, else a stand-in that answers 503 (startup never fails)
        services.AddSingleton<IMediaStorage>(sp =>
        {
            var settings = CloudinarySettings.FromConfiguration(sp.GetRequiredService<IConfiguration>());

            return settings.IsConfigured
                ? new CloudinaryMediaStorage(settings, sp.GetRequiredService<ILogger<CloudinaryMediaStorage>>())
                : new UnavailableMediaStorage();
        });

        // Message & Notifications
        services.AddScoped<IEmailSender, MockEmailSender>();
        services.AddScoped<ISmsSender, MockSmsSender>();
        services.AddScoped<INotificationOutboxService, EfNotificationOutboxService>();
        services.AddSingleton<IUserIdProvider, SignalRUserIdProvider>();

        // Domain Services
        services.AddTransient<LikeToggleService>();
        services.AddTransient<CommentPostingService>();
        services.AddTransient<SavedItemToggleService>();
        services.AddTransient<UserProfileService>();
        services.AddTransient<UserRelationManager>();

        // Unit of work: the request's DbContext is storage + domain event source
        services.AddScoped<IDataStorage>(sp => sp.GetRequiredService<YSocialDbContext>());
        services.AddScoped<IDomainEventsProvider>(sp => sp.GetRequiredService<YSocialDbContext>());
        services.AddScoped<IPendingDomainEvents>(sp => sp.GetRequiredService<YSocialDbContext>());

        // Domain Events Dispatcher
        services.AddScoped<IDomainEventsDispatcher, DomainEventsDispatcher>();

        // Unit of work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Other services
        services.AddSignalR();
        services.AddScoped<NotificationOutboxProcessor>();
        services.AddHostedService<ProcessNotificationOutboxJob>();

        return services;
    }
}
