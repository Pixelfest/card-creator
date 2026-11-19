using System.Net;

namespace CardCreator.Server.Collections;

/// <summary>A container of Sets, reachable only by its unguessable Collection URL.</summary>
public class Collection
{
    public const string DefaultName = "Untitled collection";
    public const int MaxNameLength = 200;

    public required string Id { get; init; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; init; }
    public IPAddress? CreatedIp { get; init; }
}
