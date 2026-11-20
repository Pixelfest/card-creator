using System.Net.Http.Json;
using CardCreator.Server.Artwork;
using CardCreator.Server.Cards;
using CardCreator.Server.Collections;
using CardCreator.Server.Data;
using CardCreator.Server.Ids;
using CardCreator.Server.Sets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardCreator.Server.Tests;

/// <summary>A clock the test moves by hand.</summary>
public sealed class ManualClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now;
}

[Collection(AppCollection.Name)]
public class ArtworkPurgeTests(AppFactory factory)
{
    private static readonly DateTimeOffset Today = new(2026, 11, 20, 3, 0, 0, TimeSpan.Zero);

    private HttpClient Client => factory.AllowlistedClientViaNginx();

    private async Task<(string CollectionId, string SetId)> CreateSet(string? collectionId = null)
    {
        collectionId ??= (await (await Client.PostAsync("/api/collections", null)).Content.ReadFromJsonAsync<CollectionDto>())!.Id;
        var set = await (await Client.PostAsync($"/api/collections/{collectionId}/sets", null)).Content.ReadFromJsonAsync<SetDto>();
        return (collectionId, set!.Id);
    }

    private async Task<CardDto> AddCardShowing((string CollectionId, string SetId) set, string artworkId)
    {
        var response = await Client.PostAsJsonAsync(
            $"/api/collections/{set.CollectionId}/sets/{set.SetId}/cards",
            new
            {
                name = "Card",
                copies = 1,
                design = new
                {
                    fill = "#ffffff",
                    frame = (string?)null,
                    artwork = new { id = artworkId, width = 10, height = 10, zoom = 1, x = 0, y = 0 },
                    snippets = new { },
                },
            }
        );
        return (await response.Content.ReadFromJsonAsync<CardDto>())!;
    }

    /// <summary>An Artwork row and file, last referenced at the given time.</summary>
    private async Task<string> StoredArtwork(string collectionId, DateTimeOffset lastReferenced)
    {
        var id = Base62Id.New();
        await File.WriteAllBytesAsync(Path.Combine(factory.ArtworkRoot, id + ".png"), [1, 2, 3]);
        await WithDb(async db =>
        {
            db.ArtworkFiles.Add(
                new ArtworkFile
                {
                    Id = id,
                    CollectionId = collectionId,
                    Path = id + ".png",
                    ContentType = "image/png",
                    CreatedAt = lastReferenced,
                    LastReferencedAt = lastReferenced,
                }
            );
            await db.SaveChangesAsync();
        });
        return id;
    }

    private async Task WithDb(Func<AppDbContext, Task> action)
    {
        using var scope = factory.Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private async Task<PurgeResult> Purge(DateTimeOffset now)
    {
        using var scope = factory.Services.CreateScope();
        var purge = new ArtworkPurge(
            scope.ServiceProvider.GetRequiredService<AppDbContext>(),
            scope.ServiceProvider.GetRequiredService<ArtworkStorage>(),
            new ManualClock(now),
            NullLogger<ArtworkPurge>.Instance
        );
        return await purge.RunAsync(CancellationToken.None);
    }

    private async Task<ArtworkFile?> Row(string id)
    {
        ArtworkFile? row = null;
        await WithDb(async db => row = await db.ArtworkFiles.AsNoTracking().SingleOrDefaultAsync(a => a.Id == id));
        return row;
    }

    private bool FileExists(string id) => File.Exists(Path.Combine(factory.ArtworkRoot, id + ".png"));

    [Fact]
    public async Task Referenced_Artwork_is_kept_and_marked_referenced_now_however_old()
    {
        var set = await CreateSet();
        var artwork = await StoredArtwork(set.CollectionId, Today.AddDays(-100));
        await AddCardShowing(set, artwork);

        await Purge(Today);

        var row = await Row(artwork);
        Assert.NotNull(row);
        Assert.Equal(Today, row.LastReferencedAt);
        Assert.True(FileExists(artwork));
    }

    [Fact]
    public async Task Recently_unreferenced_Artwork_is_kept()
    {
        var set = await CreateSet();
        var artwork = await StoredArtwork(set.CollectionId, Today.AddDays(-29));

        await Purge(Today);

        Assert.Equal(Today.AddDays(-29), (await Row(artwork))!.LastReferencedAt);
        Assert.True(FileExists(artwork));
    }

    [Fact]
    public async Task Artwork_unreferenced_for_30_days_or_more_is_deleted_file_and_row()
    {
        var set = await CreateSet();
        var thirtyDays = await StoredArtwork(set.CollectionId, Today.AddDays(-30));
        var older = await StoredArtwork(set.CollectionId, Today.AddDays(-45));

        await Purge(Today);

        Assert.Null(await Row(thirtyDays));
        Assert.Null(await Row(older));
        Assert.False(FileExists(thirtyDays));
        Assert.False(FileExists(older));
    }

    [Fact]
    public async Task A_shared_file_stays_while_any_reference_remains()
    {
        // One Artwork on a Card, copied by duplicating the Card and the whole Set.
        var set = await CreateSet();
        var artwork = await StoredArtwork(set.CollectionId, Today);
        await AddCardShowing(set, artwork);
        await AddCardShowing(set, artwork);
        var copiedSet = await (await Client.PostAsync($"/api/collections/{set.CollectionId}/sets/{set.SetId}/duplicate", null))
            .Content.ReadFromJsonAsync<SetDto>();

        // The original Set goes; the copied Set still shows it.
        await Client.DeleteAsync($"/api/collections/{set.CollectionId}/sets/{set.SetId}");
        await Purge(Today.AddDays(40));
        Assert.NotNull(await Row(artwork));
        Assert.True(FileExists(artwork));

        // Once the copy goes too, it is only deleted after another 30 days.
        await Client.DeleteAsync($"/api/collections/{set.CollectionId}/sets/{copiedSet!.Id}");
        await Purge(Today.AddDays(60));
        Assert.NotNull(await Row(artwork));
        await Purge(Today.AddDays(71));
        Assert.Null(await Row(artwork));
        Assert.False(FileExists(artwork));
    }

    [Fact]
    public async Task A_row_whose_file_is_already_gone_is_still_removed()
    {
        var set = await CreateSet();
        var artwork = await StoredArtwork(set.CollectionId, Today.AddDays(-40));
        File.Delete(Path.Combine(factory.ArtworkRoot, artwork + ".png"));

        await Purge(Today);

        Assert.Null(await Row(artwork));
    }

    [Theory]
    [InlineData("""{"fill":"#fff","artwork":{"id":"abc","zoom":1}}""", "abc")]
    [InlineData("""{"fill":"#fff","artwork":null}""", null)]
    [InlineData("""{"fill":"#fff"}""", null)]
    [InlineData("""{"artwork":{"id":42}}""", null)]
    [InlineData("not json", null)]
    public void The_Artwork_id_is_read_from_the_design(string design, string? expected)
    {
        Assert.Equal(expected, ArtworkPurge.ArtworkIdOf(design));
    }
}
