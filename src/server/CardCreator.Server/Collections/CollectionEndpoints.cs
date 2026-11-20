using CardCreator.Server.Data;
using CardCreator.Server.Ids;

namespace CardCreator.Server.Collections;

public record CollectionDto(string Id, string Name, DateTimeOffset CreatedAt)
{
    public static CollectionDto From(Collection collection) =>
        new(collection.Id, collection.Name, collection.CreatedAt);
}

public record CollectionCreationDto(bool Allowed, string? ClientIp);

public record RenameCollectionRequest(string? Name);

/// <summary>
/// Collection endpoints. There is deliberately no endpoint that lists Collections: holding
/// the Collection URL is the only way in.
/// </summary>
public static class CollectionEndpoints
{
    public static IEndpointRouteBuilder MapCollectionEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        // Tells the home page whether to offer "New collection", and which IP the server sees
        // so the owner knows what to add to the allowlist.
        api.MapGet(
            "/collection-creation",
            (HttpContext http, CollectionCreationPolicy policy) =>
                new CollectionCreationDto(
                    policy.IsAllowed(http.Connection.RemoteIpAddress),
                    CollectionCreationPolicy.Describe(http.Connection.RemoteIpAddress)
                )
        );

        api.MapPost("/collections", CreateAsync);
        api.MapGet("/collections/{collectionId}", GetAsync);
        api.MapPatch("/collections/{collectionId}", RenameAsync);

        return app;
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http,
        CollectionCreationPolicy policy,
        AppDbContext db,
        ILogger<Collection> logger,
        CancellationToken ct
    )
    {
        var clientIp = http.Connection.RemoteIpAddress;
        if (!policy.IsAllowed(clientIp))
        {
            logger.LogWarning("Refused to create a Collection for {ClientIp}", clientIp);
            return Results.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Creating a Collection is not allowed from this address.",
                detail: "Ask the owner for a Collection link."
            );
        }

        var collection = new Collection
        {
            Id = Base62Id.New(),
            Name = Collection.DefaultName,
            CreatedAt = DateTimeOffset.UtcNow,
            CreatedIp = clientIp,
        };
        db.Collections.Add(collection);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/collections/{collection.Id}", CollectionDto.From(collection));
    }

    private static async Task<IResult> GetAsync(
        string collectionId,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var collection = await FindAsync(db, collectionId, ct);
        return collection is null ? NotFound() : Results.Ok(CollectionDto.From(collection));
    }

    private static async Task<IResult> RenameAsync(
        string collectionId,
        RenameCollectionRequest request,
        AppDbContext db,
        CancellationToken ct
    )
    {
        var name = Names.Normalize(request.Name);
        if (name is null)
        {
            return Names.Invalid();
        }

        var collection = await FindAsync(db, collectionId, ct);
        if (collection is null)
        {
            return NotFound();
        }

        collection.Name = name;
        await db.SaveChangesAsync(ct);
        return Results.Ok(CollectionDto.From(collection));
    }

    internal static async Task<Collection?> FindAsync(
        AppDbContext db,
        string collectionId,
        CancellationToken ct
    ) => Base62Id.IsValid(collectionId) ? await db.Collections.FindAsync([collectionId], ct) : null;

    private static IResult NotFound() => Problems.NotFound("Collection");
}
