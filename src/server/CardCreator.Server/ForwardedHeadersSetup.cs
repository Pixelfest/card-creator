using Microsoft.AspNetCore.HttpOverrides;

namespace CardCreator.Server;

/// <summary>
/// The app runs behind the owner's nginx, which reaches the container through Docker's port
/// publishing, so every request arrives from the Docker gateway. Only that network is trusted
/// to supply X-Forwarded-For; anything else keeps its own address. See docs/spec.md, section 13.
/// </summary>
public static class ForwardedHeadersSetup
{
    public const string TrustedNetworksKey = "ForwardedHeaders:TrustedNetworks";

    public static IServiceCollection AddTrustedForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        var networks = configuration.GetSection(TrustedNetworksKey).Get<string[]>() ?? [];

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders =
                ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // Drop the loopback defaults: only the configured networks are trusted.
            options.KnownProxies.Clear();
            options.KnownIPNetworks.Clear();
            foreach (var network in networks)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        return services;
    }
}
