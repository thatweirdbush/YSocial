using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using YSocial.Domain.Media;

namespace YSocial.Infrastructure.Persistence.Configurations;

internal sealed class MediaAssetConfiguration : IEntityTypeConfiguration<MediaAsset>
{
    public void Configure(EntityTypeBuilder<MediaAsset> builder)
    {
        builder.ToTable("MediaAssets");

        builder.Property(a => a.PublicId).HasMaxLength(200).IsRequired();
        builder.Property(a => a.Url).HasMaxLength(2048);
        builder.Property(a => a.PosterUrl).HasMaxLength(2048);

        // Attach, discard, release and sweep claim race on it: exactly one transition wins
        builder.Property(a => a.Version).IsConcurrencyToken();

        builder.HasIndex(a => a.PublicId).IsUnique();
        builder.HasIndex(a => new { a.OwnerId, a.Status });
        builder.HasIndex(a => new { a.Status, a.StatusChangedAt });
    }
}
