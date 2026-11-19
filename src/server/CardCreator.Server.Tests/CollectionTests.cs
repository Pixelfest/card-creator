using System.Net;
using System.Net.Http.Json;
using CardCreator.Server.Collections;
using CardCreator.Server.Ids;
using Microsoft.AspNetCore.Mvc;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class CollectionTests(AppFactory factory)
{
    private static readonly IPAddress OtherClient = IPAddress.Parse("198.51.100.20");

    private async Task<CollectionDto> CreateCollection()
    {
        var response = await factory.AllowlistedClientViaNginx().PostAsync("/api/collections", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CollectionDto>())!;
    }

    // ---- The allowlist ----

    [Fact]
    public async Task An_allowlisted_ip_forwarded_by_nginx_can_create_a_Collection()
    {
        var response = await factory.AllowlistedClientViaNginx().PostAsync("/api/collections", null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task An_allowlisted_ip_connecting_directly_can_create_a_Collection()
    {
        var response = await factory
            .ClientFrom(AppFactory.AllowlistedClient)
            .PostAsync("/api/collections", null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Any_other_ip_gets_403_ProblemDetails()
    {
        var response = await factory
            .ClientFrom(AppFactory.DockerGateway, OtherClient.ToString())
            .PostAsync("/api/collections", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal(403, problem!.Status);
    }

    [Fact]
    public async Task A_spoofed_X_Forwarded_For_from_an_untrusted_peer_cannot_create_a_Collection()
    {
        var response = await factory
            .ClientFrom(OtherClient, AppFactory.AllowlistedClient.ToString())
            .PostAsync("/api/collections", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task The_UI_is_told_whether_this_client_may_create_a_Collection()
    {
        var allowed = await factory
            .AllowlistedClientViaNginx()
            .GetFromJsonAsync<CollectionCreationDto>("/api/collection-creation");
        var refused = await factory
            .ClientFrom(AppFactory.DockerGateway, OtherClient.ToString())
            .GetFromJsonAsync<CollectionCreationDto>("/api/collection-creation");

        Assert.True(allowed!.Allowed);
        Assert.False(refused!.Allowed);
    }

    // ---- Creating, reading, renaming ----

    [Fact]
    public async Task A_new_Collection_has_a_base62_id_and_the_default_name()
    {
        var created = await CreateCollection();

        Assert.Matches("^[0-9A-Za-z]{22}$", created.Id);
        Assert.Equal("Untitled collection", created.Name);
    }

    [Fact]
    public async Task Anyone_with_the_id_can_read_the_Collection()
    {
        var created = await CreateCollection();

        var read = await factory
            .ClientFrom(AppFactory.DockerGateway, OtherClient.ToString())
            .GetFromJsonAsync<CollectionDto>($"/api/collections/{created.Id}");

        Assert.Equal(created.Id, read!.Id);
        Assert.Equal(created.Name, read.Name);
    }

    [Fact]
    public async Task Anyone_with_the_id_can_rename_the_Collection()
    {
        var created = await CreateCollection();
        var client = factory.ClientFrom(AppFactory.DockerGateway, OtherClient.ToString());

        var response = await client.PatchAsJsonAsync(
            $"/api/collections/{created.Id}",
            new { name = "  Dragon Game  " }
        );

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var read = await client.GetFromJsonAsync<CollectionDto>($"/api/collections/{created.Id}");
        Assert.Equal("Dragon Game", read!.Name);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task A_blank_name_is_rejected(string? name)
    {
        var created = await CreateCollection();

        var response = await factory
            .AllowlistedClientViaNginx()
            .PatchAsJsonAsync($"/api/collections/{created.Id}", new { name });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_name_over_200_characters_is_rejected()
    {
        var created = await CreateCollection();

        var response = await factory
            .AllowlistedClientViaNginx()
            .PatchAsJsonAsync($"/api/collections/{created.Id}", new { name = new string('x', 201) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- Not found and no listing ----

    [Theory]
    [InlineData("0000000000000000000000")] // well-formed, never issued
    [InlineData("not-an-id")]
    public async Task An_unknown_id_is_404_ProblemDetails(string id)
    {
        var client = factory.AllowlistedClientViaNginx();

        var get = await client.GetAsync($"/api/collections/{id}");
        var rename = await client.PatchAsJsonAsync($"/api/collections/{id}", new { name = "x" });

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal("application/problem+json", get.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, rename.StatusCode);
    }

    [Fact]
    public async Task There_is_no_endpoint_that_lists_Collections()
    {
        await CreateCollection();

        var response = await factory.AllowlistedClientViaNginx().GetAsync("/api/collections");

        Assert.False(response.IsSuccessStatusCode);
    }
}

public class Base62IdTests
{
    [Fact]
    public void Ids_are_22_base62_characters_and_do_not_repeat()
    {
        var ids = Enumerable.Range(0, 10_000).Select(_ => Base62Id.New()).ToList();

        Assert.All(ids, id => Assert.True(Base62Id.IsValid(id), id));
        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    [Theory]
    [InlineData("0000000000000000000000", true)]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzz", true)]
    [InlineData("000000000000000000000", false)]
    [InlineData("00000000000000000000000", false)]
    [InlineData("000000000000000000000-", false)]
    [InlineData(null, false)]
    public void IsValid_accepts_only_22_base62_characters(string? id, bool valid)
    {
        Assert.Equal(valid, Base62Id.IsValid(id));
    }
}
