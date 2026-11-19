using CardCreator.Server.Data;
using Npgsql;

namespace CardCreator.Server.Tests;

[Collection(AppCollection.Name)]
public class DatabaseNamingTests(AppFactory factory)
{
    [Fact]
    public async Task The_migrations_history_table_keeps_EFs_default_columns()
    {
        // Databases created by the walking skeleton have "MigrationId"/"ProductVersion".
        // Renaming them (as the EFCore.NamingConventions package does) makes those databases
        // fail to start.
        factory.CreateClient(); // starts the app, which migrates
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            "select column_name from information_schema.columns where table_name = '__EFMigrationsHistory' order by column_name",
            connection
        );
        var columns = new List<string>();
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                columns.Add(reader.GetString(0));
            }
        }

        Assert.Equal(["MigrationId", "ProductVersion"], columns);
    }

    [Theory]
    [InlineData("Collections", "collections")]
    [InlineData("CreatedIp", "created_ip")]
    [InlineData("LastReferencedAt", "last_referenced_at")]
    [InlineData("PK_Collections", "pk_collections")]
    [InlineData("IX_Cards_SetId", "ix_cards_set_id")]
    [InlineData("id", "id")]
    public void ToSnakeCase(string name, string expected)
    {
        Assert.Equal(expected, SnakeCaseNames.ToSnakeCase(name));
    }
}
