using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using CardCreator.Server.Artwork;
using CardCreator.Server.Collections;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Png.Chunks;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class ArtworkTests(AppFactory factory)
{
    private HttpClient Client => factory.AllowlistedClientViaNginx();

    private async Task<string> CreateCollection() =>
        (await (await Client.PostAsync("/api/collections", null)).Content.ReadFromJsonAsync<CollectionDto>())!.Id;

    private Task<HttpResponseMessage> Upload(string collectionId, byte[] bytes, string fileName = "photo.jpg", string contentType = "image/jpeg")
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var form = new MultipartFormDataContent { { content, "file", fileName } };
        return Client.PostAsync($"/api/collections/{collectionId}/artwork", form);
    }

    /// <summary>
    /// A 40×20 JPEG whose EXIF says "rotate 90°" and carries a GPS position, a camera owner
    /// and XMP: everything that must not survive an upload.
    /// </summary>
    private static byte[] JpegWithExifAndGps()
    {
        using var image = new Image<Rgba32>(40, 20, Color.CornflowerBlue);
        var exif = new ExifProfile();
        exif.SetValue(ExifTag.Orientation, (ushort)6); // rotate 90° clockwise to display
        exif.SetValue(ExifTag.GPSLatitudeRef, "N");
        exif.SetValue(ExifTag.GPSLatitude, [new Rational(52, 1), new Rational(22, 1), new Rational(0, 1)]);
        exif.SetValue(ExifTag.GPSLongitudeRef, "E");
        exif.SetValue(ExifTag.GPSLongitude, [new Rational(4, 1), new Rational(53, 1), new Rational(0, 1)]);
        exif.SetValue(ExifTag.Artist, "Secret Owner");
        exif.SetValue(ExifTag.Model, "SpyCam 3000");
        image.Metadata.ExifProfile = exif;
        image.Metadata.XmpProfile = new SixLabors.ImageSharp.Metadata.Profiles.Xmp.XmpProfile(
            Encoding.UTF8.GetBytes("<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:Description>Secret Owner</rdf:Description></x:xmpmeta>")
        );
        using var stream = new MemoryStream();
        image.SaveAsJpeg(stream);
        return stream.ToArray();
    }

    private static byte[] PngWithText()
    {
        using var image = new Image<Rgba32>(30, 30, Color.Gold);
        image.Metadata.GetPngMetadata().TextData.Add(new PngTextData("Author", "Secret Owner", "", ""));
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        return stream.ToArray();
    }

    private static byte[] Webp()
    {
        using var image = new Image<Rgba32>(16, 24, Color.Teal);
        using var stream = new MemoryStream();
        image.SaveAsWebp(stream, new WebpEncoder { FileFormat = WebpFileFormatType.Lossy });
        return stream.ToArray();
    }

    private static bool Contains(byte[] haystack, string needle) =>
        haystack.AsSpan().IndexOf(Encoding.ASCII.GetBytes(needle)) >= 0;

    // ---- Metadata stripping and orientation ----

    [Fact]
    public async Task An_uploaded_JPEG_loses_its_EXIF_GPS_and_XMP_and_has_its_orientation_applied()
    {
        var collectionId = await CreateCollection();
        var original = JpegWithExifAndGps();
        Assert.True(Contains(original, "Secret Owner")); // the fixture really has it

        var response = await Upload(collectionId, original);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var artwork = await response.Content.ReadFromJsonAsync<ArtworkDto>();
        Assert.Equal("image/jpeg", artwork!.ContentType);
        Assert.Equal((20, 40), (artwork.Width, artwork.Height)); // rotated, not resized

        var stored = await Client.GetByteArrayAsync(artwork.Url);
        Assert.False(Contains(stored, "Exif"));
        Assert.False(Contains(stored, "Secret Owner"));
        Assert.False(Contains(stored, "SpyCam"));
        Assert.False(Contains(stored, "adobe:ns:meta"));
        using var decoded = Image.Load(stored);
        Assert.Null(decoded.Metadata.ExifProfile);
        Assert.Null(decoded.Metadata.XmpProfile);
        Assert.Equal((20, 40), (decoded.Width, decoded.Height));
    }

    [Fact]
    public async Task A_PNG_loses_its_text_chunks_and_stays_a_PNG()
    {
        var collectionId = await CreateCollection();

        var response = await Upload(collectionId, PngWithText(), "card.png", "image/png");

        var artwork = await response.Content.ReadFromJsonAsync<ArtworkDto>();
        Assert.Equal("image/png", artwork!.ContentType);
        var stored = await Client.GetByteArrayAsync(artwork.Url);
        Assert.False(Contains(stored, "Secret Owner"));
        Assert.Equal(ArtworkFormat.Png, ArtworkProcessor.Detect(stored));
        Assert.Equal((30, 30), (artwork.Width, artwork.Height));
    }

    [Fact]
    public async Task A_WebP_stays_a_WebP()
    {
        var collectionId = await CreateCollection();

        var response = await Upload(collectionId, Webp(), "art.webp", "image/webp");

        var artwork = await response.Content.ReadFromJsonAsync<ArtworkDto>();
        Assert.Equal("image/webp", artwork!.ContentType);
        Assert.Equal(ArtworkFormat.Webp, ArtworkProcessor.Detect(await Client.GetByteArrayAsync(artwork.Url)));
    }

    // ---- Validation ----

    [Fact]
    public async Task The_type_is_checked_by_content_not_by_name()
    {
        var collectionId = await CreateCollection();

        var text = await Upload(collectionId, Encoding.UTF8.GetBytes("not an image at all"), "photo.jpg", "image/jpeg");
        var gif = await Upload(collectionId, Encoding.ASCII.GetBytes("GIF89a....."), "photo.png", "image/png");

        Assert.Equal(HttpStatusCode.BadRequest, text.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, gif.StatusCode);
        Assert.Equal("application/problem+json", text.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task A_damaged_image_is_400()
    {
        var collectionId = await CreateCollection();
        var damaged = JpegWithExifAndGps()[..40]; // the right header, then nothing

        var response = await Upload(collectionId, damaged);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_empty_upload_is_400()
    {
        var collectionId = await CreateCollection();

        var response = await Upload(collectionId, []);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task More_than_10_MB_is_413()
    {
        var collectionId = await CreateCollection();
        var tooBig = new byte[ArtworkProcessor.MaxBytes + 1];
        JpegWithExifAndGps().CopyTo(tooBig, 0);

        var response = await Upload(collectionId, tooBig);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Theory]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }, ArtworkFormat.Jpeg)]
    [InlineData(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, ArtworkFormat.Png)]
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50 }, ArtworkFormat.Webp)]
    [InlineData(new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61 }, null)] // GIF
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45 }, null)] // WAV
    public void Formats_are_detected_from_the_first_bytes(byte[] header, ArtworkFormat? expected)
    {
        Assert.Equal(expected, ArtworkProcessor.Detect(header));
    }

    // ---- Scoping ----

    [Fact]
    public async Task Artwork_is_only_reachable_through_its_own_Collection()
    {
        var mine = await CreateCollection();
        var theirs = await CreateCollection();
        var response = await Upload(theirs, PngWithText(), "a.png", "image/png");
        var artwork = await response.Content.ReadFromJsonAsync<ArtworkDto>();

        var viaMine = await Client.GetAsync($"/api/collections/{mine}/artwork/{artwork!.Id}");
        var viaTheirs = await Client.GetAsync(artwork.Url);

        Assert.Equal(HttpStatusCode.NotFound, viaMine.StatusCode);
        Assert.Equal(HttpStatusCode.OK, viaTheirs.StatusCode);
        var cache = viaTheirs.Headers.CacheControl!;
        Assert.True(cache.Private);
        Assert.Equal(TimeSpan.FromDays(365), cache.MaxAge);
        Assert.Contains(cache.Extensions, e => e.Name == "immutable");
    }

    [Fact]
    public async Task Uploading_to_an_unknown_Collection_is_404()
    {
        var response = await Upload("0000000000000000000000", PngWithText(), "a.png", "image/png");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_file_is_stored_on_the_artwork_volume_named_by_id()
    {
        var collectionId = await CreateCollection();

        var artwork = await (await Upload(collectionId, PngWithText(), "a.png", "image/png")).Content.ReadFromJsonAsync<ArtworkDto>();

        Assert.True(File.Exists(Path.Combine(factory.ArtworkRoot, artwork!.Id + ".png")));
    }
}
