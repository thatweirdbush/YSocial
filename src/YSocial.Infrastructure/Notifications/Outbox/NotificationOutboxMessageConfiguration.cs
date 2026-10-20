using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace YSocial.Infrastructure.Notifications.Outbox;

internal sealed class NotificationOutboxMessageConfiguration : IEntityTypeConfiguration<NotificationOutboxMessage>
{
    public void Configure(EntityTypeBuilder<NotificationOutboxMessage> builder)
    {
        builder.ToTable("NotificationOutboxMessages");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();

        // Content column is jsonb on Npgsql (set in YSocialDbContext, provider-neutral here)
        builder.Property(x => x.Type).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Content).IsRequired();

        // Scan index: only unprocessed messages
        builder.HasIndex(x => x.ProcessedOnUtc)
            .HasFilter("\"ProcessedOnUtc\" IS NULL");
    }
}
