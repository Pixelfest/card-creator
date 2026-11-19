using System.Net;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class HealthTests(AppFactory factory)
{
    [Fact]
    public async Task Health_returns_200_when_the_database_is_reachable()
    {
        var response = await factory.CreateClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_path_returns_404_not_the_spa()
    {
        var response = await factory.CreateClient().GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
