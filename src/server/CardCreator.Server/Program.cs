using CardCreator.Server;
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

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

app.MapGet(
    "/health",
    async (AppDbContext db, CancellationToken ct) =>
        await db.Database.CanConnectAsync(ct)
            ? Results.Text("Healthy")
            : Results.Problem("Database unreachable", statusCode: 503)
);

app.MapCollectionEndpoints();
app.MapSetEndpoints();

// Unknown API paths are a real 404, never the SPA's index.html.
app.MapGroup("/api").MapFallback(() => Results.NotFound());

// The React app is built into wwwroot (see Dockerfile); client-side routes fall back to it.
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
