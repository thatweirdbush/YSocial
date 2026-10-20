using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Persistence.Configurations;

internal sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("Accounts");

        builder.Property(a => a.Email).HasMaxLength(320).IsRequired();
        builder.Property(a => a.PhoneNumber).HasMaxLength(32);
        builder.Property(a => a.PasswordHash)
            .HasConversion(hash => hash.Value, value => PasswordHash.Create(value))
            .HasColumnName("PasswordHash")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property<int>(YSocialDbContext.AccountVersion).IsConcurrencyToken();

        builder.HasIndex(a => a.Email).IsUnique();
        builder.HasIndex(a => a.PhoneNumber);

        builder.HasMany(a => a.RefreshTokens)
            .WithOne()
            .HasForeignKey(t => t.AccountId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(a => a.RefreshTokens).HasField("_refreshTokens").AutoInclude();

        builder.HasMany(a => a.PasswordResetTokens)
            .WithOne()
            .HasForeignKey("AccountId")
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(a => a.PasswordResetTokens).HasField("_passwordResetTokens").AutoInclude();
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("RefreshTokens");

        builder.Property(t => t.Token).HasMaxLength(64).IsRequired();
        builder.Property(t => t.DeviceId).HasMaxLength(200).IsRequired();

        builder.HasIndex(t => t.Token).IsUnique();
        builder.HasIndex(t => t.AccountId);
    }
}

internal sealed class PasswordResetTokenConfiguration : IEntityTypeConfiguration<PasswordResetToken>
{
    public void Configure(EntityTypeBuilder<PasswordResetToken> builder)
    {
        builder.ToTable("PasswordResetTokens");

        builder.Property(t => t.HashedToken).HasMaxLength(100).IsRequired();
    }
}
