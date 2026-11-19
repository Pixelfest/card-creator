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

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine")
        .Build();

    /// <summary>The address the test server pretends the TCP connection came from.</summary>
    public IPAddress PeerAddress { get; set; } = DockerGateway;

    /// <summary>The client address the app ended up with after its middleware ran.</summary>
    public IPAddress? LastResolvedClientAddress { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", _postgres.GetConnectionString());
        builder.ConfigureServices(services =>
            services.AddSingleton<IStartupFilter>(new PeerAddressFilter(this))
        );
    }

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
