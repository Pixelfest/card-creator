using System.Net;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class ForwardedHeadersTests(AppFactory factory)
{
    private async Task<IPAddress?> ResolveClientAddress(IPAddress peer, string forwardedFor)
    {
        factory.PeerAddress = peer;
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("X-Forwarded-For", forwardedFor);

        var response = await factory.CreateClient().SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return factory.LastResolvedClientAddress;
    }

    [Fact]
    public async Task X_Forwarded_For_from_the_Docker_gateway_gives_the_client_ip()
    {
        var client = await ResolveClientAddress(AppFactory.DockerGateway, "203.0.113.7");

        Assert.Equal(IPAddress.Parse("203.0.113.7"), client);
    }

    [Fact]
    public async Task The_gateway_as_an_IPv4_mapped_IPv6_peer_is_trusted()
    {
        // Kestrel listens dual-stack, so Docker's gateway shows up as ::ffff:172.30.42.1.
        var client = await ResolveClientAddress(
            AppFactory.DockerGateway.MapToIPv6(),
            "203.0.113.7"
        );

        Assert.Equal(IPAddress.Parse("203.0.113.7"), client);
    }

    [Fact]
    public async Task Only_the_address_nginx_appended_is_used()
    {
        // nginx's $proxy_add_x_forwarded_for appends the real peer to whatever the client sent.
        var client = await ResolveClientAddress(
            AppFactory.DockerGateway,
            "198.51.100.99, 203.0.113.7"
        );

        Assert.Equal(IPAddress.Parse("203.0.113.7"), client);
    }

    [Fact]
    public async Task X_Forwarded_For_from_outside_the_gateway_network_is_ignored()
    {
        var untrusted = IPAddress.Parse("10.1.2.3");

        var client = await ResolveClientAddress(untrusted, "203.0.113.7");

        Assert.Equal(untrusted, client);
    }
}
