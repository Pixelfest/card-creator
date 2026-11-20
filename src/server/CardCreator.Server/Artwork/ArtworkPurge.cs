using System.Text.Json;
using CardCreator.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Artwork;

public record PurgeResult(int Referenced, int Deleted);

/// <summary>
/// Deletes Artwork no Card has referenced for 30 days (docs/spec.md, section 9). First every
/// Artwork still referenced by any Card's design gets <c>last_referenced_at = now</c>, so a
/// file shared by duplicated Cards or Sets stays while any reference remains; then files and
/// rows unreferenced for 30 days or more go.
/// </summary>
public sealed class ArtworkPurge(AppDbContext db, ArtworkStorage storage, TimeProvider clock, ILogger<ArtworkPurge> logger)
{
    public static readonly TimeSpan KeepUnreferencedFor = TimeSpan.FromDays(30);

    public async Task<PurgeResult> RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        // The design is the client's JSON: read the Artwork id out of it here rather than
        // querying inside jsonb.
        var referenced = new HashSet<string>(StringComparer.Ordinal);
        await foreach (var design in db.Cards.AsNoTracking().Select(c => c.Design).AsAsyncEnumerable().WithCancellation(ct))
        {
            if (ArtworkIdOf(design) is { } id)
            {
                referenced.Add(id);
            }
        }

        var touched = 0;
        foreach (var batch in referenced.Chunk(500))
        {
            touched += await db.ArtworkFiles.Where(a => batch.Contains(a.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.LastReferencedAt, now), ct);
        }

        var cutoff = now - KeepUnreferencedFor;
        var expired = await db.ArtworkFiles.Where(a => a.LastReferencedAt <= cutoff).ToListAsync(ct);
        foreach (var artwork in expired)
        {
            try
            {
                File.Delete(storage.FullPath(artwork.Path));
            }
            catch (IOException e)
            {
                // Leave the row so the next run tries again.
                logger.LogWarning(e, "Could not delete Artwork file {Path}", artwork.Path);
                continue;
            }
            db.ArtworkFiles.Remove(artwork);
        }
        await db.SaveChangesAsync(ct);

        var deleted = expired.Count(a => db.Entry(a).State == EntityState.Detached);
        logger.LogInformation(
            "Artwork purge: {Referenced} referenced, {Deleted} deleted (unreferenced since {Cutoff:yyyy-MM-dd})",
            touched,
            deleted,
            cutoff
        );
        return new PurgeResult(touched, deleted);
    }

    /// <summary>The Artwork id in a Card design, or null.</summary>
    public static string? ArtworkIdOf(string design)
    {
        try
        {
            using var document = JsonDocument.Parse(design);
            return document.RootElement.TryGetProperty("artwork", out var artwork)
                && artwork.ValueKind == JsonValueKind.Object
                && artwork.TryGetProperty("id", out var id)
                && id.ValueKind == JsonValueKind.String
                ? id.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>Runs the purge once a day (and shortly after startup).</summary>
public sealed class ArtworkPurgeService(IServiceScopeFactory scopes, TimeProvider clock, ILogger<ArtworkPurgeService> logger)
    : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromDays(1);
    public static readonly TimeSpan FirstRunDelay = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(FirstRunDelay, clock, stoppingToken);
            using var timer = new PeriodicTimer(Interval, clock);
            do
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<ArtworkPurge>().RunAsync(stoppingToken);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogError(e, "Artwork purge failed; trying again tomorrow");
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
    }
}
