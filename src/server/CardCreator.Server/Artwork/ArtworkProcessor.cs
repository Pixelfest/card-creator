using NetVips;

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

    /// <summary>
    /// Re-encodes a detected image. Each format is opened with its own loader, so nothing else
    /// libvips can read (TIFF, SVG, PDF, …) is ever reached. Throws <see cref="VipsException"/>
    /// on a broken image.
    /// </summary>
    public static ProcessedArtwork Process(byte[] input, ArtworkFormat format)
    {
        using var loaded = format switch
        {
            ArtworkFormat.Jpeg => Image.JpegloadBuffer(input, failOn: Enums.FailOn.Error),
            ArtworkFormat.Png => Image.PngloadBuffer(input, failOn: Enums.FailOn.Error),
            _ => Image.WebploadBuffer(input, failOn: Enums.FailOn.Error),
        };
        // Applies the EXIF orientation and drops the tag.
        using var image = loaded.Autorot();

        // Keep only the ICC profile: EXIF, XMP, IPTC and PNG text/comments are all dropped.
        var bytes = format switch
        {
            ArtworkFormat.Jpeg => image.JpegsaveBuffer(q: JpegQuality, keep: Enums.ForeignKeep.Icc),
            ArtworkFormat.Png => image.PngsaveBuffer(keep: Enums.ForeignKeep.Icc),
            _ => image.WebpsaveBuffer(q: WebpQuality, lossless: IsLosslessWebp(input), keep: Enums.ForeignKeep.Icc),
        };
        return new ProcessedArtwork(bytes, format, image.Width, image.Height);
    }

    /// <summary>A WebP is lossless when it has no lossy ("VP8 ") bitstream chunk.</summary>
    public static bool IsLosslessWebp(ReadOnlySpan<byte> webp)
    {
        // RIFF header (12 bytes), then chunks: fourcc, little-endian size, data padded to even.
        long offset = 12;
        while (offset + 8 <= webp.Length)
        {
            var fourcc = webp.Slice((int)offset, 4);
            if (fourcc.SequenceEqual("VP8 "u8))
            {
                return false;
            }
            if (fourcc.SequenceEqual("VP8L"u8))
            {
                return true;
            }
            long size = BitConverter.ToUInt32(webp.Slice((int)offset + 4, 4));
            offset += 8 + size + (size & 1);
        }
        return false;
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
