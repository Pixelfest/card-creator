using CardCreator.Server;
using CardCreator.Server.Assets;
using CardCreator.Server.Cards;
using CardCreator.Server.Collections;
using CardCreator.Server.Data;
using CardCreator.Server.Sets;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddTrustedForwardedHeaders(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"))
);
builder.Services.AddSingleton<CollectionCreationPolicy>();
builder.Services.AddAssetLibrary(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

// Scan the asset library now, so problems are logged at startup.
app.Services.GetRequiredService<AssetLibrary>();

app.MapGet(
    "/health",
    async (AppDbContext db, CancellationToken ct) =>
        await db.Database.CanConnectAsync(ct)
            ? Results.Text("Healthy")
            : Results.Problem("Database unreachable", statusCode: 503)
);

app.MapCollectionEndpoints();
app.MapSetEndpoints();
app.MapCardEndpoints();
app.MapAssetEndpoints();

// Unknown API paths are a real 404, never the SPA's index.html.
app.MapGroup("/api").MapFallback(() => Results.NotFound());

// The React app is built into wwwroot (see Dockerfile); client-side routes fall back to it.
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
