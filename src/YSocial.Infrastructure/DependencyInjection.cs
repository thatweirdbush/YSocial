using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Messaging;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Comments;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Messaging;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Notifications;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Connect database
        services.AddDbContext<MockDataStore>(opt =>
            opt.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));

        // Repositories
        services.AddSingleton<IPostRepository, MockPostRepository>();
        services.AddSingleton<IAccountRepository, MockAccountRepository>();
        services.AddSingleton<ILikeRepository, MockLikeRepository>();
        services.AddSingleton<IUserRepository, MockUserRepository>();
        services.AddSingleton<ICommentRepository, MockCommentRepository>();
        services.AddSingleton<ISavedItemRepository, MockSavedItemRepository>();
        services.AddSingleton<IUserRelationRepository, MockUserRelationRepository>();
        services.AddSingleton<IUserBlockRepository, MockUserBlockRepository>();
        services.AddSingleton<INotificationRepository, MockNotificationRepository>();

        services.AddScoped<IUserContext, UserContext>();
        services.AddSingleton<IJwtProvider, JwtProvider>();
        services.AddSingleton<IAccountSessionLock, AccountSessionLock>();
        services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();

        // Message & Notifications
        services.AddScoped<IEmailSender, MockEmailSender>();
        services.AddScoped<ISmsSender, MockSmsSender>();
        services.AddScoped<INotificationOutboxService, EfNotificationOutboxService>();
        services.AddSingleton<IUserIdProvider, SignalRUserIdProvider>();
        services.AddSingleton<MockNotificationOutboxStore>();

        // Domain Services
        services.AddTransient<LikeToggleService>();
        services.AddTransient<CommentPostingService>();
        services.AddTransient<SavedItemToggleService>();
        services.AddTransient<UserProfileService>();
        services.AddTransient<UserRelationManager>();

        // Database
        //services.AddScoped<IDataStorage>(sp => sp.GetRequiredService<YSocialDbContext>());
        //services.AddScoped<IDomainEventsProvider>(sp => sp.GetRequiredService<YSocialDbContext>());

        services.AddScoped<IDataStorage>(sp => sp.GetRequiredService<MockDataStore>());
        services.AddScoped<IDomainEventsProvider>(sp => sp.GetRequiredService<MockDataStore>());
        services.AddScoped<IPendingDomainEvents>(sp => sp.GetRequiredService<MockDataStore>());

        // Domain Events Dispatcher
        services.AddScoped<IDomainEventsDispatcher, DomainEventsDispatcher>();

        // Unit of work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Other services
        services.AddSignalR();
        services.AddHostedService<ProcessNotificationOutboxJob>();

        return services;
    }
}
