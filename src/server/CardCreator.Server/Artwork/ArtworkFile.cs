namespace CardCreator.Server.Artwork;

/// <summary>
/// An uploaded Artwork image. The file lives on the artwork volume, named by id; the database
/// holds metadata only. Cards point at it from their design (shared by duplicated Cards).
/// </summary>
public class ArtworkFile
{
    public required string Id { get; init; }
    public required string CollectionId { get; init; }

    /// <summary>File name inside the artwork folder, e.g. "3f9XkQ2bL0aZ7yT1mN4pRs.jpg".</summary>
    public required string Path { get; init; }
    public required string ContentType { get; init; }
    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>When a Card last referred to it; the purge job (#24) keeps this up to date.</summary>
    public DateTimeOffset LastReferencedAt { get; set; }
}
