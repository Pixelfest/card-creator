namespace CardCreator.Server.Cards;

/// <summary>
/// One design within a Set. <see cref="Design"/> is opaque JSON owned by the client (fill
/// colour, Frame, Artwork, Text snippets); the server never queries inside it.
/// </summary>
public class Card
{
    public const int MaxCopies = 999;

    /// <summary>Keeps a runaway client from storing megabytes per Card.</summary>
    public const int MaxDesignLength = 64 * 1024;

    public required string Id { get; init; }
    public required string SetId { get; init; }
    public int Position { get; set; }
    public required string Name { get; set; }
    public int Copies { get; set; }

    /// <summary>A JSON object, stored as jsonb.</summary>
    public required string Design { get; set; }

    /// <summary>Starts at 1 and goes up by one on every save; a stale save gets 409.</summary>
    public int Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
