using CardCreator.Server.Collections;
using CardCreator.Server.Ids;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Collection> Collections => Set<Collection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Collection>(collection =>
        {
            collection.HasKey(c => c.Id);
            collection.Property(c => c.Id).HasMaxLength(Base62Id.Length);
            collection.Property(c => c.Name).HasMaxLength(Collection.MaxNameLength);
        });

        modelBuilder.ApplySnakeCaseNames();
    }
}
