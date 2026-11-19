using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace CardCreator.Server.Tests;

/// <summary>
/// Boots the real app against a throwaway PostgreSQL container, in the Production environment
/// so the forwarded-headers configuration under test is the one that ships.
/// </summary>
public sealed class AppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    /// <summary>An address inside the Docker gateway network trusted in production.</summary>
    public static readonly IPAddress DockerGateway = IPAddress.Parse("172.30.42.1");

    /// <summary>The one client IP in CollectionCreation:AllowedIps.</summary>
    public static readonly IPAddress AllowlistedClient = IPAddress.Parse("203.0.113.7");

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    /// <summary>The address the test server pretends the TCP connection came from.</summary>
    public IPAddress PeerAddress { get; set; } = DockerGateway;

    /// <summary>The client address the app ended up with after its middleware ran.</summary>
    public IPAddress? LastResolvedClientAddress { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", _postgres.GetConnectionString());
        builder.UseSetting("CollectionCreation:AllowedIps:0", AllowlistedClient.ToString());
        builder.ConfigureServices(services =>
            services.AddSingleton<IStartupFilter>(new PeerAddressFilter(this))
        );
    }

    /// <summary>
    /// A client whose requests arrive from <paramref name="peer"/>, optionally carrying the
    /// X-Forwarded-For header nginx would add.
    /// </summary>
    public HttpClient ClientFrom(IPAddress peer, string? forwardedFor = null)
    {
        PeerAddress = peer;
        var client = CreateClient();
        if (forwardedFor is not null)
        {
            client.DefaultRequestHeaders.Add("X-Forwarded-For", forwardedFor);
        }
        return client;
    }

    /// <summary>A client the app sees as the allowlisted IP, forwarded by nginx.</summary>
    public HttpClient AllowlistedClientViaNginx() =>
        ClientFrom(DockerGateway, AllowlistedClient.ToString());

    public Task InitializeAsync() => _postgres.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    /// <summary>
    /// TestServer has no real socket, so this sets the peer address before the app's own
    /// pipeline runs and records what the app resolved it to afterwards.
    /// </summary>
    private sealed class PeerAddressFilter(AppFactory factory) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
            app =>
            {
                app.Use(
                    async (context, nextMiddleware) =>
                    {
                        context.Connection.RemoteIpAddress = factory.PeerAddress;
                        await nextMiddleware(context);
                        factory.LastResolvedClientAddress = context.Connection.RemoteIpAddress;
                    }
                );
                next(app);
            };
    }
}

/// <summary>
/// All API tests share one app and one PostgreSQL container, and run one at a time because
/// they set <see cref="AppFactory.PeerAddress"/>.
/// </summary>
[CollectionDefinition(Name)]
public sealed class AppCollection : ICollectionFixture<AppFactory>
{
    public const string Name = "App";
}
