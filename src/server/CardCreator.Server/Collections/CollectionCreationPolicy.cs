using System.Net;

namespace CardCreator.Server.Collections;

/// <summary>
/// Only client IPs listed in <c>CollectionCreation:AllowedIps</c> may create a Collection
/// (env <c>CollectionCreation__AllowedIps__0=…</c>). The client IP is the connection's remote
/// address after ForwardedHeaders has applied nginx's X-Forwarded-For.
/// </summary>
public sealed class CollectionCreationPolicy
{
    public const string AllowedIpsKey = "CollectionCreation:AllowedIps";

    private readonly HashSet<IPAddress> _allowed;

    public CollectionCreationPolicy(IConfiguration configuration)
    {
        var configured = configuration.GetSection(AllowedIpsKey).Get<string[]>() ?? [];
        _allowed = configured
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value =>
                IPAddress.TryParse(value.Trim(), out var address)
                    ? Normalize(address)
                    : throw new InvalidOperationException(
                        $"{AllowedIpsKey} contains '{value}', which is not an IP address."
                    )
            )
            .ToHashSet();
    }

    public bool IsAllowed(IPAddress? client) => client is not null && _allowed.Contains(Normalize(client));

    // Kestrel listens dual-stack, so an IPv4 client can show up as ::ffff:a.b.c.d.
    private static IPAddress Normalize(IPAddress address) =>
        address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
}
