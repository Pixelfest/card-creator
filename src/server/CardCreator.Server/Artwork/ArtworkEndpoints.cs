using CardCreator.Server.Collections;
using CardCreator.Server.Data;
using CardCreator.Server.Ids;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using SixLabors.ImageSharp;

namespace CardCreator.Server.Artwork;

public record ArtworkDto(string Id, string Url, int Width, int Height, string ContentType);

/// <summary>Where Artwork files are stored (the artwork Docker volume in production).</summary>
public sealed class ArtworkStorage(string root)
{
    public const string PathKey = "Artwork:Path";

    public string Root { get; } = root;

    public string FullPath(string fileName) => System.IO.Path.Combine(Root, fileName);
}

public static class ArtworkEndpoints
{
    public static IServiceCollection AddArtworkStorage(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment
    )
    {
        var configured = configuration[ArtworkStorage.PathKey];
        var root = Path.GetFullPath(
            string.IsNullOrWhiteSpace(configured) ? "/data/artwork" : configured,
            environment.ContentRootPath
        );
        Directory.CreateDirectory(root);
        return services.AddSingleton(new ArtworkStorage(root));
    }

    public static IEndpointRouteBuilder MapArtworkEndpoints(this IEndpointRouteBuilder app)
    {
        var artwork = app.MapGroup("/api/collections/{collectionId}/artwork");

        artwork
            .MapPost("/", UploadAsync)
            // A form post from the editor's own page: there is no cookie to protect.
            .DisableAntiforgery()
            // Room for a 10 MB file plus the multipart envelope; larger bodies get 413.
            .WithMetadata(new RequestSizeLimitAttribute(ArtworkProcessor.MaxBytes + 64 * 1024));
        artwork.MapGet("/{artworkId}", DownloadAsync);

        return app;
    }

    public static string Url(string collectionId, string artworkId) =>
        $"/api/collections/{collectionId}/artwork/{artworkId}";

    private static async Task<IResult> UploadAsync(
        string collectionId,
        IFormFile? file,
        AppDbContext db,
        ArtworkStorage storage,
        ILogger<ArtworkFile> logger,
        CancellationToken ct
    )
    {
        if (await CollectionEndpoints.FindAsync(db, collectionId, ct) is null)
        {
            return Problems.NotFound("Collection");
        }
        if (file is null || file.Length == 0)
        {
            return Invalid("Choose an image to upload.");
        }
        if (file.Length > ArtworkProcessor.MaxBytes)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "The image is larger than 10 MB."
            );
        }

        byte[] bytes;
        await using (var stream = file.OpenReadStream())
        using (var buffer = new MemoryStream((int)file.Length))
        {
            await stream.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }

        if (ArtworkProcessor.Detect(bytes) is not { } format)
        {
            return Invalid("Only JPG, PNG and WebP images can be used.");
        }

        ProcessedArtwork processed;
        try
        {
            processed = ArtworkProcessor.Process(bytes, format);
        }
        catch (Exception e) when (e is InvalidImageContentException or UnknownImageFormatException or ImageFormatException)
        {
            logger.LogInformation(e, "Rejected an unreadable {Format} upload", format);
            return Invalid("The image could not be read. It may be damaged.");
        }

        var id = Base62Id.New();
        var fileName = id + processed.Extension;
        await File.WriteAllBytesAsync(storage.FullPath(fileName), processed.Bytes, ct);

        var now = DateTimeOffset.UtcNow;
        db.ArtworkFiles.Add(
            new ArtworkFile
            {
                Id = id,
                CollectionId = collectionId,
                Path = fileName,
                ContentType = processed.ContentType,
                CreatedAt = now,
                LastReferencedAt = now,
            }
        );
        await db.SaveChangesAsync(ct);

        return Results.Created(
            Url(collectionId, id),
            new ArtworkDto(id, Url(collectionId, id), processed.Width, processed.Height, processed.ContentType)
        );
    }

    private static async Task<IResult> DownloadAsync(
        string collectionId,
        string artworkId,
        AppDbContext db,
        ArtworkStorage storage,
        HttpContext http,
        CancellationToken ct
    )
    {
        var artwork =
            Base62Id.IsValid(collectionId) && Base62Id.IsValid(artworkId)
                ? await db.ArtworkFiles.AsNoTracking()
                    .SingleOrDefaultAsync(a => a.Id == artworkId && a.CollectionId == collectionId, ct)
                : null;
        var path = artwork is null ? null : storage.FullPath(artwork.Path);
        if (artwork is null || !File.Exists(path))
        {
            return Problems.NotFound("Artwork");
        }

        // An Artwork id always means the same bytes, so it can be cached for good.
        http.Response.Headers[HeaderNames.CacheControl] = "private, max-age=31536000, immutable";
        return Results.File(path!, artwork.ContentType);
    }

    private static IResult Invalid(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });
}
