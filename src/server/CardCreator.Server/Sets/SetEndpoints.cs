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
    // Cards arrive with #20; until then every Set is empty.
    public static SetDto From(Set set) =>
        new(set.Id, set.CollectionId, set.Name, set.CardFormat, 0, set.CreatedAt, set.UpdatedAt);
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
            .ToListAsync(ct);
        return Results.Ok(sets.Select(SetDto.From));
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
        return Created(set);
    }

    private static async Task<IResult> GetAsync(
        string collectionId,
        string setId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await FindAsync(db, collectionId, setId, ct);
        return set is null ? NotFound() : Results.Ok(SetDto.From(set));
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
        return Results.Ok(SetDto.From(set));
    }

    /// <summary>Copies the Set. Its Cards are copied too once Cards exist (#20).</summary>
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
        await db.SaveChangesAsync(ct);
        return Created(copy);
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

    private static async Task<Set?> FindAsync(
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

    private static IResult Created(Set set) =>
        Results.Created($"/api/collections/{set.CollectionId}/sets/{set.Id}", SetDto.From(set));

    private static IResult NotFound() => Problems.NotFound("Set");
}
