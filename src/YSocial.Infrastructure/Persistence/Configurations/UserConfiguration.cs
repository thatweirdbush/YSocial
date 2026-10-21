using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Conversions;

namespace YSocial.Infrastructure.Persistence.Configurations;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users");

        // Usernames are registered lowercase (validator), so the exact-match unique index is case-insensitive in practice
        builder.Property(u => u.Username).HasMaxLength(30).IsRequired();
        builder.Property(u => u.Country).HasConversion<CountryConverter>().HasMaxLength(2).IsRequired();

        builder.OwnsOne(u => u.ProfileInfo, profile =>
        {
            profile.Property(p => p.DisplayName).HasColumnName("DisplayName").HasMaxLength(50).IsRequired();
            profile.Property(p => p.Bio).HasColumnName("Bio").HasMaxLength(200);
            profile.Property(p => p.AvatarUrl).HasColumnName("AvatarUrl").HasMaxLength(2048);
            profile.Property(p => p.CoverUrl).HasColumnName("CoverUrl").HasMaxLength(2048);
            profile.Property(p => p.Gender).HasColumnName("Gender").IsRequired();
            profile.Property(p => p.DateOfBirth).HasColumnName("DateOfBirth").HasColumnType("date").HasConversion<DateOnlyDateTimeConverter>();
            profile.Property(p => p.ProfileType).HasColumnName("ProfileType").IsRequired();
        });
        builder.Navigation(u => u.ProfileInfo).IsRequired();

        builder.OwnsOne(u => u.PrivacySettings, privacy =>
        {
            privacy.Property(p => p.IsPrivateProfile).HasColumnName("IsPrivateProfile");
            privacy.Property(p => p.AllowDirectMessages).HasColumnName("AllowDirectMessages");
            privacy.Property(p => p.ShowActivityStatus).HasColumnName("ShowActivityStatus");
        });
        builder.Navigation(u => u.PrivacySettings).IsRequired();

        builder.OwnsOne(u => u.NotificationPreferences, preferences =>
        {
            preferences.Property(p => p.Likes).HasColumnName("NotifyLikes");
            preferences.Property(p => p.Replies).HasColumnName("NotifyReplies");
            preferences.Property(p => p.Follows).HasColumnName("NotifyFollows");
        });
        builder.Navigation(u => u.NotificationPreferences).IsRequired();

        builder.HasIndex(u => u.Username).IsUnique();
        builder.HasIndex(u => u.AccountId);
    }
}
