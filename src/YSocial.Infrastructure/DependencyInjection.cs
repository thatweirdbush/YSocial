using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Services.UnitOfWorks;
using YSocial.Infrastructure.Services.UnitOfWorks.DataStorage;
using YSocial.Infrastructure.Services.UnitOfWorks.DomainEventsDispatching;

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

        services.AddSingleton<IPostRepository, MockDataStore>();
        services.AddSingleton<YSocial.Domain.Identities.IAccountRepository, MockAccountRepository>();
        services.AddSingleton<YSocial.Domain.Likes.ILikeRepository, MockLikeRepository>();
        services.AddSingleton<YSocial.Domain.Users.IUserRepository, MockUserRepository>();
        
        services.AddTransient<YSocial.Domain.Likes.LikeToggleService>();
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
