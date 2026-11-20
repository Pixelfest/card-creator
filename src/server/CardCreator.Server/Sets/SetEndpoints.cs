using CardCreator.Server.Cards;
using CardCreator.Server.Collections;
using CardCreator.Server.Data;
using CardCreator.Server.Ids;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Sets;

public record SetDto(
    string Id,
    string CollectionId,
    string Name,
    string CardFormat,
    int CardCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
)
{
    public static SetDto From(Set set, int cardCount) =>
        new(set.Id, set.CollectionId, set.Name, set.CardFormat, cardCount, set.CreatedAt, set.UpdatedAt);
}

public record RenameSetRequest(string? Name);

/// <summary>
/// Set endpoints, nested under their Collection. Every request looks the Set up by both ids,
/// so a Set id used under another Collection's URL is a 404.
/// </summary>
public static class SetEndpoints
{
    public static IEndpointRouteBuilder MapSetEndpoints(this IEndpointRouteBuilder app)
    {
        var sets = app.MapGroup("/api/collections/{collectionId}/sets");

        sets.MapGet("/", ListAsync);
        sets.MapPost("/", CreateAsync);
        sets.MapGet("/{setId}", GetAsync);
        sets.MapPatch("/{setId}", RenameAsync);
        sets.MapPost("/{setId}/duplicate", DuplicateAsync);
        sets.MapDelete("/{setId}", DeleteAsync);

        return app;
    }

    private static async Task<IResult> ListAsync(
        string collectionId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        if (await CollectionEndpoints.FindAsync(db, collectionId, ct) is null)
        {
            return Problems.NotFound("Collection");
        }

        var sets = await db
            .Sets.Where(s => s.CollectionId == collectionId)
            .OrderBy(s => s.CreatedAt)
            .Select(s => new { Set = s, CardCount = db.Cards.Count(c => c.SetId == s.Id) })
            .ToListAsync(ct);
        return Results.Ok(sets.Select(s => SetDto.From(s.Set, s.CardCount)));
    }

    private static async Task<IResult> CreateAsync(
        string collectionId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        if (await CollectionEndpoints.FindAsync(db, collectionId, ct) is null)
        {
            return Problems.NotFound("Collection");
        }

        var now = DateTimeOffset.UtcNow;
        var set = new Set
        {
            Id = Base62Id.New(),
            CollectionId = collectionId,
            Name = Set.DefaultName,
            CardFormat = Set.DefaultCardFormat,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Sets.Add(set);
        await db.SaveChangesAsync(ct);
        return Created(set, cardCount: 0);
    }

    private static async Task<IResult> GetAsync(
        string collectionId,
        string setId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await FindAsync(db, collectionId, setId, ct);
        return set is null ? NotFound() : Results.Ok(await ToDtoAsync(db, set, ct));
    }

    private static async Task<IResult> RenameAsync(
        string collectionId,
        string setId,
        RenameSetRequest request,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var name = Names.Normalize(request.Name);
        if (name is null)
        {
            return Names.Invalid();
        }

        var set = await FindAsync(db, collectionId, setId, ct);
        if (set is null)
        {
            return NotFound();
        }

        set.Name = name;
        set.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(await ToDtoAsync(db, set, ct));
    }

    /// <summary>Copies the Set and its Cards. The copies share Artwork files.</summary>
    private static async Task<IResult> DuplicateAsync(
        string collectionId,
        string setId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var original = await FindAsync(db, collectionId, setId, ct);
        if (original is null)
        {
            return NotFound();
        }

        var now = DateTimeOffset.UtcNow;
        var copy = new Set
        {
            Id = Base62Id.New(),
            CollectionId = collectionId,
            Name = Names.CopyOf(original.Name),
            CardFormat = original.CardFormat,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Sets.Add(copy);
        await CardEndpoints.CopyCardsAsync(db, original.Id, copy.Id, ct);
        await db.SaveChangesAsync(ct);
        return Created(copy, await db.Cards.CountAsync(c => c.SetId == copy.Id, ct));
    }

    private static async Task<IResult> DeleteAsync(
        string collectionId,
        string setId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await FindAsync(db, collectionId, setId, ct);
        if (set is null)
        {
            return NotFound();
        }

        db.Sets.Remove(set);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    internal static async Task<Set?> FindAsync(
        AppDbContext db,
        string collectionId,
        string setId,
        CancellationToken ct
    ) =>
        Base62Id.IsValid(collectionId) && Base62Id.IsValid(setId)
            ? await db.Sets.SingleOrDefaultAsync(
                s => s.Id == setId && s.CollectionId == collectionId,
                ct
            )
            : null;

    private static IResult Created(Set set, int cardCount) =>
        Results.Created(
            $"/api/collections/{set.CollectionId}/sets/{set.Id}",
            SetDto.From(set, cardCount)
        );

    private static async Task<SetDto> ToDtoAsync(AppDbContext db, Set set, CancellationToken ct) =>
        SetDto.From(set, await db.Cards.CountAsync(c => c.SetId == set.Id, ct));

    private static IResult NotFound() => Problems.NotFound("Set");
}
