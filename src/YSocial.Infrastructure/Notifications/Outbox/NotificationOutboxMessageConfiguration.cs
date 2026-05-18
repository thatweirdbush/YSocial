using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace YSocial.Infrastructure.Notifications.Outbox;

internal sealed class NotificationOutboxMessageConfiguration : IEntityTypeConfiguration<NotificationOutboxMessage>
{
    public void Configure(EntityTypeBuilder<NotificationOutboxMessage> builder)
    {
        builder.ToTable("NotificationOutboxMessages");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Type).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Content).HasColumnType("jsonb").IsRequired();

        // Important Index for the scanning
        builder.HasIndex(x => x.ProcessedOnUtc)
            .HasFilter(@"""ProcessedOnUtc"" IS NULL");
    }
}
