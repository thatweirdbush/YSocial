using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
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

        services.AddSingleton<IPostRepository, MockPostRepository>();
        services.AddSingleton<IAccountRepository, MockAccountRepository>();
        services.AddSingleton<ILikeRepository, MockLikeRepository>();
        services.AddSingleton<IUserRepository, MockUserRepository>();
        
        services.AddScoped<IUserContext, UserContext>();

        services.AddTransient<LikeToggleService>();
        //services.AddSingleton<IPostRepository, MockDataStore>();

        //services.AddScoped<IDataStorage>(sp => sp.GetRequiredService<YSocialDbContext>());
        //services.AddScoped<IDomainEventsProvider>(sp => sp.GetRequiredService<YSocialDbContext>());

        services.AddScoped<IDataStorage>(sp => sp.GetRequiredService<MockDataStore>());
        services.AddScoped<IDomainEventsProvider>(sp => sp.GetRequiredService<MockDataStore>());

        // Domain Events Dispatcher
        services.AddScoped<IDomainEventsDispatcher, DomainEventsDispatcher>();

        // Unit of work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        return services;
    }
}
