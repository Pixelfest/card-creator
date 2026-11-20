using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace CardCreator.Server.Artwork;

public enum ArtworkFormat
{
    Jpeg,
    Png,
    Webp,
}

public record ProcessedArtwork(byte[] Bytes, ArtworkFormat Format, int Width, int Height)
{
    public string ContentType => ArtworkProcessor.ContentType(Format);
    public string Extension => ArtworkProcessor.Extension(Format);
}

/// <summary>
/// Artwork rules (docs/spec.md, section 9): JPG, PNG or WebP detected by content, at most
/// 10 MB. The orientation is applied, all metadata (EXIF with GPS, XMP, IPTC, text chunks,
/// comments) is stripped and the image is re-encoded in the same format at high quality,
/// without resizing. The ICC colour profile is kept: it carries no personal data and
/// dropping it would shift the colours of wide-gamut photos.
/// </summary>
public static class ArtworkProcessor
{
    public const long MaxBytes = 10 * 1024 * 1024;
    public const int JpegQuality = 92;
    public const int WebpQuality = 92;

    /// <summary>The format from the file's first bytes, whatever its name or stated type says.</summary>
    public static ArtworkFormat? Detect(ReadOnlySpan<byte> header)
    {
        if (header.Length >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return ArtworkFormat.Jpeg;
        }
        if (header.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return ArtworkFormat.Png;
        }
        if (header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8))
        {
            return ArtworkFormat.Webp;
        }
        return null;
    }

    /// <summary>Re-encodes a detected image. Throws <see cref="InvalidImageContentException"/> on a broken one.</summary>
    public static ProcessedArtwork Process(byte[] input, ArtworkFormat format)
    {
        using var image = Image.Load(input);
        image.Mutate(x => x.AutoOrient());

        var metadata = image.Metadata;
        metadata.ExifProfile = null;
        metadata.XmpProfile = null;
        metadata.IptcProfile = null;
        foreach (var frame in image.Frames)
        {
            frame.Metadata.ExifProfile = null;
            frame.Metadata.XmpProfile = null;
            frame.Metadata.IptcProfile = null;
        }
        metadata.GetPngMetadata().TextData.Clear();

        using var output = new MemoryStream();
        switch (format)
        {
            case ArtworkFormat.Jpeg:
                image.SaveAsJpeg(output, new JpegEncoder { Quality = JpegQuality, SkipMetadata = false });
                break;
            case ArtworkFormat.Png:
                image.SaveAsPng(output, new PngEncoder { SkipMetadata = false });
                break;
            case ArtworkFormat.Webp:
                var lossless = metadata.GetWebpMetadata().FileFormat == WebpFileFormatType.Lossless;
                image.SaveAsWebp(
                    output,
                    new WebpEncoder
                    {
                        FileFormat = lossless ? WebpFileFormatType.Lossless : WebpFileFormatType.Lossy,
                        Quality = WebpQuality,
                        SkipMetadata = false,
                    }
                );
                break;
        }
        return new ProcessedArtwork(output.ToArray(), format, image.Width, image.Height);
    }

    public static string ContentType(ArtworkFormat format) =>
        format switch
        {
            ArtworkFormat.Jpeg => "image/jpeg",
            ArtworkFormat.Png => "image/png",
            _ => "image/webp",
        };

    public static string Extension(ArtworkFormat format) =>
        format switch
        {
            ArtworkFormat.Jpeg => ".jpg",
            ArtworkFormat.Png => ".png",
            _ => ".webp",
        };
}
