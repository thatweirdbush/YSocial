using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;

namespace YSocial.Infrastructure.Persistence.Configurations;

internal sealed class UserRelationConfiguration : IEntityTypeConfiguration<UserRelation>
{
    public void Configure(EntityTypeBuilder<UserRelation> builder)
    {
        builder.ToTable("UserRelations");

        // 1 edge per ordered pair: unfollow soft-deletes, re-follow restores
        builder.HasIndex(r => new { r.ObserverId, r.TargetId }).IsUnique();
        builder.HasIndex(r => new { r.TargetId, r.FollowStatus });
    }
}

internal sealed class UserBlockConfiguration : IEntityTypeConfiguration<UserBlock>
{
    public void Configure(EntityTypeBuilder<UserBlock> builder)
    {
        builder.ToTable("UserBlocks");

        builder.HasIndex(b => new { b.ObserverId, b.TargetId }).IsUnique();
        builder.HasIndex(b => b.TargetId);
    }
}

internal sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");

        builder.Property(n => n.Title).HasMaxLength(200).IsRequired();
        builder.Property(n => n.Content).HasMaxLength(1000).IsRequired();

        builder.HasIndex(n => new { n.RecipientId, n.CreatedAt });
    }
}
