using System.Text.Json;
using CardCreator.Server.Data;
using CardCreator.Server.Ids;
using CardCreator.Server.Sets;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Cards;

public record CardDto(
    string Id,
    string SetId,
    int Position,
    string Name,
    int Copies,
    JsonElement Design,
    int Version,
    DateTimeOffset UpdatedAt
)
{
    public static CardDto From(Card card)
    {
        using var design = JsonDocument.Parse(card.Design);
        return new CardDto(
            card.Id,
            card.SetId,
            card.Position,
            card.Name,
            card.Copies,
            design.RootElement.Clone(),
            card.Version,
            card.UpdatedAt
        );
    }
}

/// <param name="Id">Optional: lets undo restore a deleted Card under its own id.</param>
/// <param name="Position">Where to insert; omitted or past the end appends.</param>
public record CreateCardRequest(
    string? Id,
    string? Name,
    int Copies,
    JsonElement Design,
    int? Position
);

/// <param name="Version">The version this edit was based on.</param>
public record SaveCardRequest(string? Name, int Copies, JsonElement Design, int Version);

public record ReorderCardsRequest(List<string>? CardIds);

/// <summary>
/// Card endpoints, nested under their Set and Collection. Saving is a versioned PUT: a stale
/// version returns 409 with the current Card (docs/spec.md, sections 2, 4 and 8).
/// </summary>
public static class CardEndpoints
{
    public static IEndpointRouteBuilder MapCardEndpoints(this IEndpointRouteBuilder app)
    {
        var cards = app.MapGroup("/api/collections/{collectionId}/sets/{setId}/cards");

        cards.MapGet("/", ListAsync);
        cards.MapPost("/", CreateAsync);
        cards.MapPut("/order", ReorderAsync);
        cards.MapPut("/{cardId}", SaveAsync);
        cards.MapDelete("/{cardId}", DeleteAsync);

        return app;
    }

    private static async Task<IResult> ListAsync(
        string collectionId,
        string setId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        if (await SetEndpoints.FindAsync(db, collectionId, setId, ct) is null)
        {
            return Problems.NotFound("Set");
        }
        var cards = await Ordered(db, setId).ToListAsync(ct);
        return Results.Ok(cards.Select(CardDto.From));
    }

    private static async Task<IResult> CreateAsync(
        string collectionId,
        string setId,
        CreateCardRequest request,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await SetEndpoints.FindAsync(db, collectionId, setId, ct);
        if (set is null)
        {
            return Problems.NotFound("Set");
        }
        if (Validate(request.Name, request.Copies, request.Design) is { } invalid)
        {
            return invalid;
        }
        if (request.Id is not null)
        {
            if (!Base62Id.IsValid(request.Id))
            {
                return Invalid("id", "The id must be 22 base62 characters.");
            }
            if (await db.Cards.AnyAsync(c => c.Id == request.Id, ct))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    title: "A Card with this id already exists."
                );
            }
        }

        var siblings = await Ordered(db, setId).ToListAsync(ct);
        var position = Math.Clamp(request.Position ?? siblings.Count, 0, siblings.Count);
        foreach (var sibling in siblings.Skip(position))
        {
            sibling.Position++;
        }

        var now = DateTimeOffset.UtcNow;
        var card = new Card
        {
            Id = request.Id ?? Base62Id.New(),
            SetId = setId,
            Position = position,
            Name = Names.Normalize(request.Name)!,
            Copies = request.Copies,
            Design = request.Design.GetRawText(),
            Version = 1,
            UpdatedAt = now,
        };
        db.Cards.Add(card);
        set.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/collections/{collectionId}/sets/{setId}/cards/{card.Id}",
            CardDto.From(card)
        );
    }

    private static async Task<IResult> SaveAsync(
        string collectionId,
        string setId,
        string cardId,
        SaveCardRequest request,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await SetEndpoints.FindAsync(db, collectionId, setId, ct);
        var card = set is null ? null : await FindAsync(db, setId, cardId, ct);
        if (set is null || card is null)
        {
            return NotFound();
        }
        if (Validate(request.Name, request.Copies, request.Design) is { } invalid)
        {
            return invalid;
        }
        if (request.Version != card.Version)
        {
            // Someone else saved first: hand back their version so the user can choose.
            return Results.Conflict(CardDto.From(card));
        }

        var now = DateTimeOffset.UtcNow;
        card.Name = Names.Normalize(request.Name)!;
        card.Copies = request.Copies;
        card.Design = request.Design.GetRawText();
        card.Version++;
        card.UpdatedAt = now;
        set.UpdatedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Lost a race with a save that passed the same version check.
            await db.Entry(card).ReloadAsync(ct);
            return Results.Conflict(CardDto.From(card));
        }
        return Results.Ok(CardDto.From(card));
    }

    private static async Task<IResult> DeleteAsync(
        string collectionId,
        string setId,
        string cardId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await SetEndpoints.FindAsync(db, collectionId, setId, ct);
        var card = set is null ? null : await FindAsync(db, setId, cardId, ct);
        if (set is null || card is null)
        {
            return NotFound();
        }

        db.Cards.Remove(card);
        foreach (var later in await db.Cards.Where(c => c.SetId == setId && c.Position > card.Position).ToListAsync(ct))
        {
            later.Position--;
        }
        set.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>Sets the whole order at once. The ids must be exactly the Set's Cards.</summary>
    private static async Task<IResult> ReorderAsync(
        string collectionId,
        string setId,
        ReorderCardsRequest request,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var set = await SetEndpoints.FindAsync(db, collectionId, setId, ct);
        if (set is null)
        {
            return Problems.NotFound("Set");
        }

        var cards = await db.Cards.Where(c => c.SetId == setId).ToDictionaryAsync(c => c.Id, ct);
        var ids = request.CardIds ?? [];
        if (ids.Count != cards.Count || ids.Distinct().Count() != ids.Count || !ids.All(cards.ContainsKey))
        {
            return Invalid("cardIds", "The order must list every Card in the Set exactly once.");
        }

        for (var i = 0; i < ids.Count; i++)
        {
            cards[ids[i]].Position = i;
        }
        set.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>Copies every Card of one Set into another (used by Set duplicate).</summary>
    public static async Task CopyCardsAsync(AppDbContext db, string fromSetId, string toSetId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var card in await Ordered(db, fromSetId).AsNoTracking().ToListAsync(ct))
        {
            db.Cards.Add(
                new Card
                {
                    Id = Base62Id.New(),
                    SetId = toSetId,
                    Position = card.Position,
                    Name = card.Name,
                    Copies = card.Copies,
                    Design = card.Design,
                    Version = 1,
                    UpdatedAt = now,
                }
            );
        }
    }

    private static IQueryable<Card> Ordered(AppDbContext db, string setId) =>
        db.Cards.Where(c => c.SetId == setId).OrderBy(c => c.Position).ThenBy(c => c.UpdatedAt);

    private static async Task<Card?> FindAsync(AppDbContext db, string setId, string cardId, CancellationToken ct) =>
        Base62Id.IsValid(cardId)
            ? await db.Cards.SingleOrDefaultAsync(c => c.Id == cardId && c.SetId == setId, ct)
            : null;

    private static IResult? Validate(string? name, int copies, JsonElement design)
    {
        if (Names.Normalize(name) is null)
        {
            return Names.Invalid();
        }
        if (copies is < 0 or > Card.MaxCopies)
        {
            return Invalid("copies", $"Copies must be 0 to {Card.MaxCopies}.");
        }
        if (design.ValueKind != JsonValueKind.Object)
        {
            return Invalid("design", "The design must be a JSON object.");
        }
        if (design.GetRawText().Length > Card.MaxDesignLength)
        {
            return Invalid("design", "The design is too large.");
        }
        return null;
    }

    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static IResult NotFound() => Problems.NotFound("Card");
}
