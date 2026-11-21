using System.Buffers.Binary;
using System.Security.Cryptography;

namespace CardCreator.Server.Assets;

/// <summary>One repository-supplied asset file (docs/spec.md, section 5).</summary>
/// <param name="Path">Relative to the assets folder, with forward slashes. Cards store this.</param>
/// <param name="Url">Content-hashed, so it can be cached forever.</param>
/// <param name="AspectRatio">Width / height, for images only.</param>
public record AssetFile(
    string Path,
    string DisplayName,
    string Url,
    double? AspectRatio,
    string Hash,
    string FullPath,
    string ContentType
);

/// <summary>
/// The asset library, scanned once at startup:
/// <c>frames/44x72/*.png</c>, <c>fonts/*.woff2|ttf|otf</c>, <c>snippet-backgrounds/*.png</c>,
/// <c>icons/*.png</c>, <c>emoji/*.svg</c> (Twemoji) and an optional <c>CREDITS.md</c>.
/// </summary>
public sealed class AssetLibrary
{
    public const string UrlPrefix = "/assets";

    /// <summary>The only Card format, 44:72. Frames further off than this are skipped.</summary>
    public const double FrameRatio = 44.0 / 72.0;
    public const double FrameRatioTolerance = 0.01;

    private readonly Dictionary<string, AssetFile> _byPath;

    private AssetLibrary(
        IReadOnlyList<AssetFile> frames,
        IReadOnlyList<AssetFile> fonts,
        IReadOnlyList<AssetFile> snippetBackgrounds,
        IReadOnlyList<AssetFile> icons,
        string? emojiFolder,
        string? emojiHash,
        string credits
    )
    {
        Frames = frames;
        Fonts = fonts;
        SnippetBackgrounds = snippetBackgrounds;
        Icons = icons;
        EmojiFolder = emojiFolder;
        EmojiHash = emojiHash;
        Credits = credits;
        _byPath = frames
            .Concat(fonts)
            .Concat(snippetBackgrounds)
            .Concat(icons)
            .ToDictionary(a => a.Path, StringComparer.Ordinal);
    }

    public IReadOnlyList<AssetFile> Frames { get; }
    public IReadOnlyList<AssetFile> Fonts { get; }
    public IReadOnlyList<AssetFile> SnippetBackgrounds { get; }

    /// <summary>Corner icons: PNGs of any size; the editor draws them by width.</summary>
    public IReadOnlyList<AssetFile> Icons { get; }

    /// <summary>The Twemoji folder, or null when there are no emoji.</summary>
    public string? EmojiFolder { get; }

    /// <summary>One hash over the whole emoji set, used in its base URL.</summary>
    public string? EmojiHash { get; }

    public string? EmojiBaseUrl => EmojiHash is null ? null : $"{UrlPrefix}/emoji/{EmojiHash}/";

    /// <summary>The contents of CREDITS.md, or empty.</summary>
    public string Credits { get; }

    /// <summary>The file at this hashed URL, or null if the path is unknown or the hash is stale.</summary>
    public AssetFile? Find(string hash, string path) =>
        _byPath.TryGetValue(path, out var asset) && asset.Hash == hash ? asset : null;

    /// <summary>The emoji file at this hashed URL, or null.</summary>
    public string? FindEmoji(string hash, string fileName)
    {
        if (EmojiFolder is null || hash != EmojiHash || !IsPlainSvgName(fileName))
        {
            return null;
        }
        var fullPath = System.IO.Path.Combine(EmojiFolder, fileName);
        return File.Exists(fullPath) ? fullPath : null;
    }

    public static AssetLibrary Scan(string root, ILogger logger)
    {
        if (!Directory.Exists(root))
        {
            logger.LogWarning("Asset folder {Root} does not exist; the asset library is empty", root);
            return new AssetLibrary([], [], [], [], null, null, "");
        }

        var frames = ScanImages(root, "frames/44x72", logger, requireFrameRatio: true);
        var fonts = Files(root, "fonts", ".woff2", ".ttf", ".otf")
            .Select(file => Describe(root, file, aspectRatio: null))
            .ToList();
        var backgrounds = ScanImages(root, "snippet-backgrounds", logger, requireFrameRatio: false);
        var icons = ScanImages(root, "icons", logger, requireFrameRatio: false);

        var emojiFolder = System.IO.Path.Combine(root, "emoji");
        var emojiFiles = Files(root, "emoji", ".svg").ToList();
        var emojiHash = emojiFiles.Count == 0 ? null : HashFolder(emojiFiles);

        var creditsPath = System.IO.Path.Combine(root, "CREDITS.md");
        var credits = File.Exists(creditsPath) ? File.ReadAllText(creditsPath) : "";

        logger.LogInformation(
            "Asset library: {Frames} frames, {Fonts} fonts, {Backgrounds} snippet backgrounds, {Icons} icons, {Emoji} emoji",
            frames.Count,
            fonts.Count,
            backgrounds.Count,
            icons.Count,
            emojiFiles.Count
        );
        return new AssetLibrary(
            frames,
            fonts,
            backgrounds,
            icons,
            emojiFiles.Count == 0 ? null : emojiFolder,
            emojiHash,
            credits
        );
    }

    /// <summary><c>gold-ornate.png</c> → "Gold ornate", <c>Cinzel-Bold.ttf</c> → "Cinzel Bold".</summary>
    public static string DisplayName(string fileName)
    {
        var stem = System.IO.Path.GetFileNameWithoutExtension(fileName);
        var words = stem.Split(['-', '_', ' '], StringSplitOptions.RemoveEmptyEntries);
        var name = string.Join(' ', words);
        return name.Length == 0 ? stem : char.ToUpperInvariant(name[0]) + name[1..];
    }

    /// <summary>Whether a Frame of this size is within about 1% of 44:72.</summary>
    public static bool HasFrameRatio(int width, int height) =>
        height > 0 && Math.Abs((double)width / height / FrameRatio - 1) <= FrameRatioTolerance;

    private static List<AssetFile> ScanImages(
        string root,
        string folder,
        ILogger logger,
        bool requireFrameRatio
    )
    {
        var result = new List<AssetFile>();
        foreach (var file in Files(root, folder, ".png"))
        {
            if (!TryReadPngSize(file, out var width, out var height))
            {
                logger.LogWarning("Skipping {File}: not a readable PNG", file);
                continue;
            }
            if (requireFrameRatio && !HasFrameRatio(width, height))
            {
                logger.LogWarning(
                    "Skipping Frame {File}: {Width}x{Height} is more than 1% off the 44:72 ratio",
                    file,
                    width,
                    height
                );
                continue;
            }
            result.Add(Describe(root, file, (double)width / height));
        }
        return result;
    }

    private static IEnumerable<string> Files(string root, string folder, params string[] extensions)
    {
        var directory = System.IO.Path.Combine(root, folder);
        if (!Directory.Exists(directory))
        {
            return [];
        }
        return Directory
            .EnumerateFiles(directory)
            .Where(f => extensions.Contains(System.IO.Path.GetExtension(f).ToLowerInvariant()))
            .Order(StringComparer.Ordinal);
    }

    private static AssetFile Describe(string root, string file, double? aspectRatio)
    {
        var path = System.IO.Path.GetRelativePath(root, file).Replace('\\', '/');
        var hash = HashFile(file);
        return new AssetFile(
            path,
            DisplayName(file),
            $"{UrlPrefix}/{hash}/{path}",
            aspectRatio,
            hash,
            file,
            ContentType(file)
        );
    }

    private static string HashFile(string file)
    {
        using var stream = File.OpenRead(file);
        return Convert.ToHexStringLower(SHA256.HashData(stream))[..16];
    }

    private static string HashFolder(IEnumerable<string> files)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var file in files)
        {
            hash.AppendData(System.Text.Encoding.UTF8.GetBytes(System.IO.Path.GetFileName(file)));
            hash.AppendData(File.ReadAllBytes(file));
        }
        return Convert.ToHexStringLower(hash.GetHashAndReset())[..16];
    }

    /// <summary>Reads the width and height from a PNG's IHDR chunk.</summary>
    public static bool TryReadPngSize(string file, out int width, out int height)
    {
        width = height = 0;
        Span<byte> header = stackalloc byte[24];
        using var stream = File.OpenRead(file);
        if (stream.ReadAtLeast(header, 24, throwOnEndOfStream: false) < 24)
        {
            return false;
        }
        ReadOnlySpan<byte> signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        if (!header[..8].SequenceEqual(signature) || !header[12..16].SequenceEqual("IHDR"u8))
        {
            return false;
        }
        width = BinaryPrimitives.ReadInt32BigEndian(header[16..20]);
        height = BinaryPrimitives.ReadInt32BigEndian(header[20..24]);
        return width > 0 && height > 0;
    }

    public static string ContentType(string file) =>
        System.IO.Path.GetExtension(file).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".svg" => "image/svg+xml",
            ".woff2" => "font/woff2",
            ".ttf" => "font/ttf",
            ".otf" => "font/otf",
            _ => "application/octet-stream",
        };

    // Twemoji names are lowercase hex code points joined by '-'; nothing else is served.
    private static bool IsPlainSvgName(string fileName) =>
        fileName.EndsWith(".svg", StringComparison.Ordinal)
        && fileName[..^4].Length > 0
        && fileName[..^4].All(c => char.IsAsciiHexDigitLower(c) || char.IsAsciiDigit(c) || c == '-');
}
