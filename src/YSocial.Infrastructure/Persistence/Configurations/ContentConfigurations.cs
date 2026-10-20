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
