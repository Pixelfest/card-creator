using System.Buffers.Binary;
using CardCreator.Server.Assets;
using Microsoft.Extensions.Logging.Abstractions;

namespace CardCreator.Server.Tests;

public sealed class AssetLibraryTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("assets-").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private string Write(string relativePath, byte[] content)
    {
        var path = Path.Combine(_root, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, content);
        return path;
    }

    /// <summary>A PNG signature and IHDR chunk: all the scanner reads.</summary>
    private static byte[] Png(int width, int height, byte salt = 0)
    {
        var bytes = new byte[33];
        byte[] signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        signature.CopyTo(bytes, 0);
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(8), 13);
        "IHDR"u8.CopyTo(bytes.AsSpan(12));
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(16), width);
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(20), height);
        bytes[32] = salt;
        return bytes;
    }

    private AssetLibrary Scan() => AssetLibrary.Scan(_root, NullLogger.Instance);

    [Theory]
    [InlineData("gold-ornate.png", "Gold ornate")]
    [InlineData("Cinzel-Bold.ttf", "Cinzel Bold")]
    [InlineData("old_paper_scroll.png", "Old paper scroll")]
    [InlineData("Lato-Regular.woff2", "Lato Regular")]
    [InlineData("x.otf", "X")]
    public void Display_names_come_from_file_names(string fileName, string expected)
    {
        Assert.Equal(expected, AssetLibrary.DisplayName(fileName));
    }

    [Theory]
    [InlineData(520, 850, true)] // the ideal size
    [InlineData(440, 720, true)] // exact 44:72
    [InlineData(520, 846, true)] // 0.5% off
    [InlineData(520, 860, false)] // about 1.2% off
    [InlineData(600, 850, false)]
    [InlineData(850, 520, false)] // landscape
    public void Frames_must_be_within_about_1_percent_of_44_by_72(int width, int height, bool kept)
    {
        Assert.Equal(kept, AssetLibrary.HasFrameRatio(width, height));
    }

    [Fact]
    public void A_Frame_off_the_ratio_is_skipped_and_the_rest_are_listed()
    {
        Write("frames/44x72/gold-ornate.png", Png(520, 850));
        Write("frames/44x72/too-wide.png", Png(600, 850));
        Write("frames/44x72/not-a-png.png", "nope"u8.ToArray());

        var library = Scan();

        var frame = Assert.Single(library.Frames);
        Assert.Equal("frames/44x72/gold-ornate.png", frame.Path);
        Assert.Equal("Gold ornate", frame.DisplayName);
        Assert.Equal(520.0 / 850, frame.AspectRatio!.Value, 6);
    }

    [Fact]
    public void Fonts_backgrounds_emoji_and_credits_are_found()
    {
        Write("fonts/Cinzel-Bold.woff2", [1, 2, 3]);
        Write("fonts/OFL.txt", [1]);
        Write("snippet-backgrounds/parchment.png", Png(640, 160));
        Write("emoji/1f600.svg", "<svg/>"u8.ToArray());
        Write("CREDITS.md", "# Credits"u8.ToArray());

        var library = Scan();

        Assert.Equal(["Cinzel Bold"], library.Fonts.Select(f => f.DisplayName));
        Assert.Null(library.Fonts[0].AspectRatio);
        Assert.Equal(4.0, Assert.Single(library.SnippetBackgrounds).AspectRatio);
        Assert.Matches("^/assets/emoji/[0-9a-f]{16}/$", library.EmojiBaseUrl!);
        Assert.Equal("# Credits", library.Credits);
    }

    [Fact]
    public void The_hashed_url_changes_when_the_file_changes()
    {
        Write("frames/44x72/gold.png", Png(520, 850, salt: 1));
        var before = Assert.Single(Scan().Frames);

        Write("frames/44x72/gold.png", Png(520, 850, salt: 2));
        var after = Assert.Single(Scan().Frames);

        Assert.NotEqual(before.Url, after.Url);
        Assert.Equal(before.Path, after.Path);
        Assert.Matches("^/assets/[0-9a-f]{16}/frames/44x72/gold.png$", after.Url);
    }

    [Fact]
    public void The_emoji_url_changes_when_any_emoji_changes()
    {
        Write("emoji/1f600.svg", "<svg>a</svg>"u8.ToArray());
        var before = Scan().EmojiBaseUrl;

        Write("emoji/1f600.svg", "<svg>b</svg>"u8.ToArray());

        Assert.NotEqual(before, Scan().EmojiBaseUrl);
    }

    [Fact]
    public void A_missing_asset_folder_gives_an_empty_library()
    {
        var library = AssetLibrary.Scan(Path.Combine(_root, "missing"), NullLogger.Instance);

        Assert.Empty(library.Frames);
        Assert.Null(library.EmojiBaseUrl);
    }
}
