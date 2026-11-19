namespace CardCreator.Server.Sets;

/// <summary>A named group of Cards inside a Collection, sharing one Card format.</summary>
public class Set
{
    public const string DefaultName = "Untitled set";

    /// <summary>The only Card format: 44×72 mm. Locked once the Set has its first Card.</summary>
    public const string DefaultCardFormat = "44x72";

    public required string Id { get; init; }
    public required string CollectionId { get; init; }
    public required string Name { get; set; }
    public required string CardFormat { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; set; }
}
