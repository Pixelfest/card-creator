using CardCreator.Server.Collections;
using CardCreator.Server.Ids;
using CardCreator.Server.Sets;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<Set> Sets => Set<Set>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Collection>(collection =>
        {
            collection.HasKey(c => c.Id);
            collection.Property(c => c.Id).HasMaxLength(Base62Id.Length);
            collection.Property(c => c.Name).HasMaxLength(Collection.MaxNameLength);
        });

        modelBuilder.Entity<Set>(set =>
        {
            set.HasKey(s => s.Id);
            set.Property(s => s.Id).HasMaxLength(Base62Id.Length);
            set.Property(s => s.CollectionId).HasMaxLength(Base62Id.Length);
            set.Property(s => s.Name).HasMaxLength(Names.MaxLength);
            set.Property(s => s.CardFormat).HasMaxLength(16);
            set.HasOne<Collection>()
                .WithMany()
                .HasForeignKey(s => s.CollectionId)
                .OnDelete(DeleteBehavior.Cascade);
            set.HasIndex(s => s.CollectionId);
        });

        modelBuilder.ApplySnakeCaseNames();
    }
}
