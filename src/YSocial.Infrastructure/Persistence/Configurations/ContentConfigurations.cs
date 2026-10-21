using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;

namespace YSocial.Infrastructure.Persistence.Configurations;

internal sealed class PostConfiguration : IEntityTypeConfiguration<Post>
{
    public void Configure(EntityTypeBuilder<Post> builder)
    {
        builder.ToTable("Posts");

        builder.Property(p => p.Content).HasMaxLength(2000).IsRequired();
        builder.Property(p => p.ImageUrl).HasMaxLength(2048);

        builder.HasIndex(p => new { p.AuthorId, p.CreatedAt });
        builder.HasIndex(p => p.CreatedAt);

        // Child rows of the aggregate (same save as the content); NOT auto-included: only discovery & edit load them
        builder.HasMany(p => p.Hashtags)
            .WithOne()
            .HasForeignKey("PostId")
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(p => p.Hashtags).HasField("_hashtags");

        // Attached media snapshots: owned, so EVERY post query loads them (each projection needs them, at most 10 rows)
        builder.OwnsMany(p => p.Media, media =>
        {
            media.ToTable("PostMedia");
            media.WithOwner().HasForeignKey("PostId");
            media.HasKey("PostId", nameof(PostMedia.Position));

            media.Property(m => m.Position).ValueGeneratedNever();
            media.Property(m => m.Url).HasMaxLength(2048).IsRequired();
            media.Property(m => m.PosterUrl).HasMaxLength(2048);
        });
        builder.Navigation(p => p.Media).HasField("_media");
    }
}

internal sealed class PostHashtagConfiguration : IEntityTypeConfiguration<PostHashtag>
{
    // Folded key can grow past the 50-char tag limit (Hangul decomposes 3x)
    private const int MaxKeyLength = 200;

    public void Configure(EntityTypeBuilder<PostHashtag> builder)
    {
        builder.ToTable("PostHashtags");

        builder.Property<PostId>("PostId");
        builder.HasKey("PostId", nameof(PostHashtag.Key));

        builder.Property(h => h.Key).HasMaxLength(MaxKeyLength).IsRequired();
        builder.Property(h => h.Display).HasMaxLength(HashtagParser.MaxTagLength).IsRequired();

        builder.HasIndex(h => h.Key);
    }
}

internal sealed class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> builder)
    {
        builder.ToTable("Comments");

        builder.Property(c => c.Content).HasMaxLength(1000).IsRequired();

        builder.HasIndex(c => c.PostId);
        builder.HasIndex(c => c.ParentCommentId);
        builder.HasIndex(c => c.AuthorId);
    }
}

internal sealed class LikeConfiguration : IEntityTypeConfiguration<Like>
{
    public void Configure(EntityTypeBuilder<Like> builder)
    {
        builder.ToTable("Likes");

        builder.HasIndex(l => new { l.UserId, l.TargetType, l.TargetId }).IsUnique();
        builder.HasIndex(l => new { l.TargetType, l.TargetId });
    }
}

internal sealed class SavedItemConfiguration : IEntityTypeConfiguration<SavedItem>
{
    public void Configure(EntityTypeBuilder<SavedItem> builder)
    {
        builder.ToTable("SavedItems");

        // Not unique: a removed (soft-deleted) row stays & a new row is created on re-save
        builder.HasIndex(s => new { s.UserId, s.TargetType, s.TargetId });
        builder.HasIndex(s => new { s.TargetType, s.TargetId });
    }
}
