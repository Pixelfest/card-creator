using CardCreator.Server.Cards;
using CardCreator.Server.Collections;
using CardCreator.Server.Ids;
using CardCreator.Server.Sets;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<Set> Sets => Set<Set>();
    public DbSet<Card> Cards => Set<Card>();

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

        modelBuilder.Entity<Card>(card =>
        {
            card.HasKey(c => c.Id);
            card.Property(c => c.Id).HasMaxLength(Base62Id.Length);
            card.Property(c => c.SetId).HasMaxLength(Base62Id.Length);
            card.Property(c => c.Name).HasMaxLength(Names.MaxLength);
            card.Property(c => c.Design).HasColumnType("jsonb");
            // Two saves based on the same version cannot both win.
            card.Property(c => c.Version).IsConcurrencyToken();
            card.HasOne<Set>()
                .WithMany()
                .HasForeignKey(c => c.SetId)
                .OnDelete(DeleteBehavior.Cascade);
            card.HasIndex(c => new { c.SetId, c.Position });
        });

        modelBuilder.ApplySnakeCaseNames();
    }
}
