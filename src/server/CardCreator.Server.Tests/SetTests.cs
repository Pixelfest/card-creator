using System.Net;
using System.Net.Http.Json;
using CardCreator.Server.Collections;
using CardCreator.Server.Sets;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class SetTests(AppFactory factory)
{
    private HttpClient Client => factory.AllowlistedClientViaNginx();

    private async Task<string> CreateCollection()
    {
        var response = await Client.PostAsync("/api/collections", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CollectionDto>())!.Id;
    }

    private async Task<SetDto> CreateSet(string collectionId)
    {
        var response = await Client.PostAsync($"/api/collections/{collectionId}/sets", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SetDto>())!;
    }

    private Task<List<SetDto>?> ListSets(string collectionId) =>
        Client.GetFromJsonAsync<List<SetDto>>($"/api/collections/{collectionId}/sets");

    // ---- Defaults ----

    [Fact]
    public async Task A_new_Set_is_an_empty_Untitled_set_in_44x72()
    {
        var collectionId = await CreateCollection();

        var set = await CreateSet(collectionId);

        Assert.Matches("^[0-9A-Za-z]{22}$", set.Id);
        Assert.Equal(collectionId, set.CollectionId);
        Assert.Equal("Untitled set", set.Name);
        Assert.Equal("44x72", set.CardFormat);
        Assert.Equal(0, set.CardCount);
    }

    [Fact]
    public async Task The_Collection_lists_its_Sets_oldest_first()
    {
        var collectionId = await CreateCollection();
        var first = await CreateSet(collectionId);
        var second = await CreateSet(collectionId);

        var sets = await ListSets(collectionId);

        Assert.Equal([first.Id, second.Id], sets!.Select(s => s.Id));
    }

    [Fact]
    public async Task Creating_or_listing_Sets_in_an_unknown_Collection_is_404()
    {
        const string unknown = "0000000000000000000000";

        var create = await Client.PostAsync($"/api/collections/{unknown}/sets", null);
        var list = await Client.GetAsync($"/api/collections/{unknown}/sets");

        Assert.Equal(HttpStatusCode.NotFound, create.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
    }

    // ---- Collection scoping ----

    [Fact]
    public async Task A_Set_from_another_Collection_is_404_for_every_request()
    {
        var mine = await CreateCollection();
        var theirs = await CreateCollection();
        var theirSet = await CreateSet(theirs);
        var url = $"/api/collections/{mine}/sets/{theirSet.Id}";

        var get = await Client.GetAsync(url);
        var rename = await Client.PatchAsJsonAsync(url, new { name = "Mine now" });
        var duplicate = await Client.PostAsync($"{url}/duplicate", null);
        var delete = await Client.DeleteAsync(url);

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, rename.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
        Assert.Empty((await ListSets(mine))!);
        var untouched = await Client.GetFromJsonAsync<SetDto>(
            $"/api/collections/{theirs}/sets/{theirSet.Id}"
        );
        Assert.Equal("Untitled set", untouched!.Name);
    }

    [Theory]
    [InlineData("0000000000000000000000")]
    [InlineData("not-an-id")]
    public async Task An_unknown_Set_id_is_404(string setId)
    {
        var collectionId = await CreateCollection();

        var response = await Client.GetAsync($"/api/collections/{collectionId}/sets/{setId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- Rename, duplicate, delete ----

    [Fact]
    public async Task Renaming_trims_the_name_and_updates_last_changed()
    {
        var collectionId = await CreateCollection();
        var set = await CreateSet(collectionId);

        var response = await Client.PatchAsJsonAsync(
            $"/api/collections/{collectionId}/sets/{set.Id}",
            new { name = "  Dragon Deck " }
        );

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var renamed = await response.Content.ReadFromJsonAsync<SetDto>();
        Assert.Equal("Dragon Deck", renamed!.Name);
        Assert.True(renamed.UpdatedAt > set.UpdatedAt);
    }

    [Fact]
    public async Task A_blank_Set_name_is_rejected()
    {
        var collectionId = await CreateCollection();
        var set = await CreateSet(collectionId);

        var response = await Client.PatchAsJsonAsync(
            $"/api/collections/{collectionId}/sets/{set.Id}",
            new { name = " " }
        );

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Duplicating_adds_a_copy_named_with_copy()
    {
        var collectionId = await CreateCollection();
        var set = await CreateSet(collectionId);
        await Client.PatchAsJsonAsync(
            $"/api/collections/{collectionId}/sets/{set.Id}",
            new { name = "Dragon Deck" }
        );

        var response = await Client.PostAsync(
            $"/api/collections/{collectionId}/sets/{set.Id}/duplicate",
            null
        );

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = await response.Content.ReadFromJsonAsync<SetDto>();
        Assert.NotEqual(set.Id, copy!.Id);
        Assert.Equal("Dragon Deck (copy)", copy.Name);
        Assert.Equal(
            ["Dragon Deck", "Dragon Deck (copy)"],
            (await ListSets(collectionId))!.Select(s => s.Name)
        );
    }

    [Fact]
    public async Task Deleting_removes_the_Set()
    {
        var collectionId = await CreateCollection();
        var keep = await CreateSet(collectionId);
        var remove = await CreateSet(collectionId);

        var response = await Client.DeleteAsync(
            $"/api/collections/{collectionId}/sets/{remove.Id}"
        );

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal([keep.Id], (await ListSets(collectionId))!.Select(s => s.Id));
        var get = await Client.GetAsync($"/api/collections/{collectionId}/sets/{remove.Id}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }
}

public class NamesTests
{
    [Fact]
    public void CopyOf_appends_copy()
    {
        Assert.Equal("Dragon Deck (copy)", Names.CopyOf("Dragon Deck"));
    }

    [Fact]
    public void CopyOf_shortens_a_long_name_so_the_copy_still_fits()
    {
        var copy = Names.CopyOf(new string('x', Names.MaxLength));

        Assert.Equal(Names.MaxLength, copy.Length);
        Assert.EndsWith(" (copy)", copy);
    }
}
