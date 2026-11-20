using Microsoft.Net.Http.Headers;

namespace CardCreator.Server.Assets;

public record AssetDto(string Path, string DisplayName, string Url, double? AspectRatio)
{
    public static AssetDto From(AssetFile asset) =>
        new(asset.Path, asset.DisplayName, asset.Url, asset.AspectRatio);
}

public record EmojiDto(string BaseUrl);

public record AssetManifestDto(
    IEnumerable<AssetDto> Frames,
    IEnumerable<AssetDto> Fonts,
    IEnumerable<AssetDto> SnippetBackgrounds,
    EmojiDto? Emoji
);

public record CreditsDto(string Markdown);

public static class AssetEndpoints
{
    public const string AssetsPathKey = "Assets:Path";

    /// <summary>Scans the asset folder once, at startup. Relative paths are from the content root.</summary>
    public static IServiceCollection AddAssetLibrary(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment
    )
    {
        var configured = configuration[AssetsPathKey];
        var root = Path.GetFullPath(
            string.IsNullOrWhiteSpace(configured) ? "assets" : configured,
            environment.ContentRootPath
        );
        return services.AddSingleton(provider =>
            AssetLibrary.Scan(root, provider.GetRequiredService<ILogger<AssetLibrary>>())
        );
    }

    public static IEndpointRouteBuilder MapAssetEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet(
            "/api/assets",
            (AssetLibrary library) =>
                new AssetManifestDto(
                    library.Frames.Select(AssetDto.From),
                    library.Fonts.Select(AssetDto.From),
                    library.SnippetBackgrounds.Select(AssetDto.From),
                    library.EmojiBaseUrl is { } baseUrl ? new EmojiDto(baseUrl) : null
                )
        );

        app.MapGet("/api/credits", (AssetLibrary library) => new CreditsDto(library.Credits));

        app.MapGet(
            $"{AssetLibrary.UrlPrefix}/emoji/{{hash}}/{{fileName}}",
            (string hash, string fileName, AssetLibrary library, HttpContext http) =>
                library.FindEmoji(hash, fileName) is { } file
                    ? Immutable(http, Results.File(file, "image/svg+xml"))
                    : Results.NotFound()
        );

        app.MapGet(
            $"{AssetLibrary.UrlPrefix}/{{hash}}/{{**path}}",
            (string hash, string path, AssetLibrary library, HttpContext http) =>
                library.Find(hash, path) is { } asset
                    ? Immutable(http, Results.File(asset.FullPath, asset.ContentType))
                    : Results.NotFound()
        );

        return app;
    }

    // The URL changes whenever the content does, so the file can be cached for good.
    private static IResult Immutable(HttpContext http, IResult result)
    {
        http.Response.Headers[HeaderNames.CacheControl] = "public, max-age=31536000, immutable";
        return result;
    }
}
