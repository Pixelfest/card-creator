using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CardCreator.Server.Cards;
using CardCreator.Server.Collections;
using CardCreator.Server.Ids;
using CardCreator.Server.Sets;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class CardTests(AppFactory factory)
{
    private HttpClient Client => factory.AllowlistedClientViaNginx();

    private static object Design(string fill = "#ffffff") =>
        new { fill, frame = "frames/44x72/gold-border.png", artwork = (object?)null, snippets = new { } };

    private async Task<(string CollectionId, string SetId)> CreateSet()
    {
        var collection = await (await Client.PostAsync("/api/collections", null))
            .Content.ReadFromJsonAsync<CollectionDto>();
        var set = await (await Client.PostAsync($"/api/collections/{collection!.Id}/sets", null))
            .Content.ReadFromJsonAsync<SetDto>();
        return (collection.Id, set!.Id);
    }

    private static string CardsUrl((string CollectionId, string SetId) set) =>
        $"/api/collections/{set.CollectionId}/sets/{set.SetId}/cards";

    private async Task<CardDto> AddCard((string, string) set, string name, int? position = null, string? id = null)
    {
        var response = await Client.PostAsJsonAsync(
            CardsUrl(set),
            new { id, name, copies = 1, design = Design(), position }
        );
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CardDto>())!;
    }

    private async Task<List<CardDto>> ListCards((string, string) set) =>
        (await Client.GetFromJsonAsync<List<CardDto>>(CardsUrl(set)))!;

    private Task<HttpResponseMessage> Save((string, string) set, CardDto card, string? name = null, int? version = null, string fill = "#ffffff") =>
        Client.PutAsJsonAsync(
            $"{CardsUrl(set)}/{card.Id}",
            new { name = name ?? card.Name, copies = card.Copies, design = Design(fill), version = version ?? card.Version }
        );

    // ---- Create and list ----

    [Fact]
    public async Task A_new_Card_starts_at_version_1_and_keeps_its_design()
    {
        var set = await CreateSet();

        var card = await AddCard(set, "Card 1");

        Assert.Matches("^[0-9A-Za-z]{22}$", card.Id);
        Assert.Equal(1, card.Version);
        Assert.Equal(0, card.Position);
        Assert.Equal("#ffffff", card.Design.GetProperty("fill").GetString());
        Assert.Equal(JsonValueKind.Null, card.Design.GetProperty("artwork").ValueKind);
    }

    [Fact]
    public async Task Cards_are_listed_in_order_and_can_be_inserted_at_a_position()
    {
        var set = await CreateSet();
        await AddCard(set, "A");
        await AddCard(set, "C");

        await AddCard(set, "B", position: 1);

        Assert.Equal(["A", "B", "C"], (await ListCards(set)).Select(c => c.Name));
        Assert.Equal([0, 1, 2], (await ListCards(set)).Select(c => c.Position));
    }

    [Fact]
    public async Task A_deleted_Card_can_be_recreated_under_its_own_id()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");
        await Client.DeleteAsync($"{CardsUrl(set)}/{card.Id}");

        var restored = await AddCard(set, "A", id: card.Id);

        Assert.Equal(card.Id, restored.Id);
    }

    [Fact]
    public async Task Creating_a_Card_with_an_id_in_use_is_409()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");

        var response = await Client.PostAsJsonAsync(
            CardsUrl(set),
            new { id = card.Id, name = "B", copies = 1, design = Design() }
        );

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Theory]
    [InlineData("", 1, true)]
    [InlineData("Card", -1, true)]
    [InlineData("Card", 1000, true)]
    [InlineData("Card", 1, false)]
    public async Task Invalid_names_copies_or_designs_are_400(string name, int copies, bool designIsObject)
    {
        var set = await CreateSet();
        object design = designIsObject ? Design() : "not an object";

        var response = await Client.PostAsJsonAsync(CardsUrl(set), new { name, copies, design });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Copies_can_be_0()
    {
        var set = await CreateSet();

        var response = await Client.PostAsJsonAsync(CardsUrl(set), new { name = "Spare", copies = 0, design = Design() });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    // ---- Versioned saves ----

    [Fact]
    public async Task Saving_bumps_the_version()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");

        var response = await Save(set, card, name: "Dragon", fill: "#000000");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<CardDto>();
        Assert.Equal(2, saved!.Version);
        Assert.Equal("Dragon", saved.Name);
        Assert.Equal("#000000", saved.Design.GetProperty("fill").GetString());
    }

    [Fact]
    public async Task A_stale_version_gets_409_with_the_current_Card()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");
        await Save(set, card, name: "Theirs");

        var response = await Save(set, card, name: "Mine"); // still based on version 1

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var current = await response.Content.ReadFromJsonAsync<CardDto>();
        Assert.Equal("Theirs", current!.Name);
        Assert.Equal(2, current.Version);
    }

    [Fact]
    public async Task Keep_mine_overwrites_by_saving_against_their_version()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");
        await Save(set, card, name: "Theirs");

        var response = await Save(set, card, name: "Mine", version: 2);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Mine", (await ListCards(set)).Single().Name);
    }

    [Fact]
    public async Task Two_saves_based_on_the_same_version_cannot_both_win()
    {
        var set = await CreateSet();
        var card = await AddCard(set, "A");

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => Save(set, card, name: $"Edit {i}")));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(5, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(2, (await ListCards(set)).Single().Version);
    }

    // ---- Delete and reorder ----

    [Fact]
    public async Task Deleting_closes_the_gap_in_positions()
    {
        var set = await CreateSet();
        await AddCard(set, "A");
        var b = await AddCard(set, "B");
        await AddCard(set, "C");

        var response = await Client.DeleteAsync($"{CardsUrl(set)}/{b.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cards = await ListCards(set);
        Assert.Equal(["A", "C"], cards.Select(c => c.Name));
        Assert.Equal([0, 1], cards.Select(c => c.Position));
    }

    [Fact]
    public async Task Reordering_sets_the_whole_order()
    {
        var set = await CreateSet();
        var a = await AddCard(set, "A");
        var b = await AddCard(set, "B");
        var c = await AddCard(set, "C");

        var response = await Client.PutAsJsonAsync($"{CardsUrl(set)}/order", new { cardIds = new[] { c.Id, a.Id, b.Id } });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(["C", "A", "B"], (await ListCards(set)).Select(x => x.Name));
    }

    [Fact]
    public async Task A_reorder_that_misses_or_repeats_a_Card_is_400()
    {
        var set = await CreateSet();
        var a = await AddCard(set, "A");
        await AddCard(set, "B");

        var missing = await Client.PutAsJsonAsync($"{CardsUrl(set)}/order", new { cardIds = new[] { a.Id } });
        var repeated = await Client.PutAsJsonAsync($"{CardsUrl(set)}/order", new { cardIds = new[] { a.Id, a.Id } });
        var foreign = await Client.PutAsJsonAsync($"{CardsUrl(set)}/order", new { cardIds = new[] { a.Id, Base62Id.New() } });

        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, repeated.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Equal(["A", "B"], (await ListCards(set)).Select(x => x.Name));
    }

    // ---- Scoping ----

    [Fact]
    public async Task A_Card_is_only_reachable_through_its_own_Set_and_Collection()
    {
        var mine = await CreateSet();
        var theirs = await CreateSet();
        var theirCard = await AddCard(theirs, "Theirs");
        var otherSetInMyCollection = (mine.CollectionId, theirs.SetId);

        var save = await Save(mine, theirCard, name: "Mine now");
        var delete = await Client.DeleteAsync($"{CardsUrl(mine)}/{theirCard.Id}");
        var listAcross = await Client.GetAsync(CardsUrl(otherSetInMyCollection));
        var reorder = await Client.PutAsJsonAsync($"{CardsUrl(mine)}/order", new { cardIds = new[] { theirCard.Id } });

        Assert.Equal(HttpStatusCode.NotFound, save.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, listAcross.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, reorder.StatusCode);
        Assert.Equal("Theirs", (await ListCards(theirs)).Single().Name);
    }

    // ---- Sets ----

    [Fact]
    public async Task Duplicating_a_Set_copies_its_Cards_in_order()
    {
        var set = await CreateSet();
        await AddCard(set, "A");
        await AddCard(set, "B");

        var response = await Client.PostAsync($"/api/collections/{set.CollectionId}/sets/{set.SetId}/duplicate", null);
        var copy = await response.Content.ReadFromJsonAsync<SetDto>();

        Assert.Equal(2, copy!.CardCount);
        var copied = await ListCards((set.CollectionId, copy.Id));
        Assert.Equal(["A", "B"], copied.Select(c => c.Name));
        Assert.All(copied, c => Assert.Equal(1, c.Version));
        Assert.Empty(copied.Select(c => c.Id).Intersect((await ListCards(set)).Select(c => c.Id)));
    }

    [Fact]
    public async Task The_Set_reports_its_card_count()
    {
        var set = await CreateSet();
        await AddCard(set, "A");
        await AddCard(set, "B");

        var dto = await Client.GetFromJsonAsync<SetDto>($"/api/collections/{set.CollectionId}/sets/{set.SetId}");
        var listed = await Client.GetFromJsonAsync<List<SetDto>>($"/api/collections/{set.CollectionId}/sets");

        Assert.Equal(2, dto!.CardCount);
        Assert.Equal(2, listed!.Single().CardCount);
    }
}
