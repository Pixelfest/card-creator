using System.Net;
using System.Net.Http.Json;
using CardCreator.Server.Assets;

namespace CardCreator.Server.Tests;

/// <summary>Runs against the repository's real assets folder.</summary>
[Collection(AppCollection.Name)]
public class AssetEndpointTests(AppFactory factory)
{
    private HttpClient Client => factory.CreateClient();

    [Fact]
    public async Task The_manifest_lists_the_starter_assets_grouped_by_type()
    {
        var manifest = await Client.GetFromJsonAsync<AssetManifestDto>("/api/assets");

        Assert.Contains(manifest!.Frames, f => f.Path == "frames/44x72/wood-frame.png" && f.DisplayName == "Wood frame");
        Assert.All(manifest.Frames, f => Assert.Equal(44.0 / 72, f.AspectRatio!.Value, 2));
        Assert.Contains(manifest.Fonts, f => f.DisplayName == "Cinzel Bold");
        Assert.NotEmpty(manifest.SnippetBackgrounds);
        Assert.NotNull(manifest.Emoji);
    }

    [Fact]
    public async Task A_hashed_asset_url_is_served_with_long_term_caching()
    {
        var manifest = await Client.GetFromJsonAsync<AssetManifestDto>("/api/assets");
        var frame = manifest!.Frames.First();

        var response = await Client.GetAsync(frame.Url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("public, max-age=31536000, immutable", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task A_stale_hash_is_404()
    {
        var manifest = await Client.GetFromJsonAsync<AssetManifestDto>("/api/assets");
        var frame = manifest!.Frames.First();

        var response = await Client.GetAsync($"/assets/0000000000000000/{frame.Path}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Emoji_are_served_from_the_hashed_emoji_folder()
    {
        var manifest = await Client.GetFromJsonAsync<AssetManifestDto>("/api/assets");

        var grinning = await Client.GetAsync($"{manifest!.Emoji!.BaseUrl}1f600.svg");
        var traversal = await Client.GetAsync($"{manifest.Emoji.BaseUrl}..%2FCREDITS.md");

        Assert.Equal(HttpStatusCode.OK, grinning.StatusCode);
        Assert.Equal("image/svg+xml", grinning.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, traversal.StatusCode);
    }

    [Fact]
    public async Task Credits_come_from_CREDITS_md()
    {
        var credits = await Client.GetFromJsonAsync<CreditsDto>("/api/credits");

        Assert.Contains("Twemoji", credits!.Markdown);
    }
}
