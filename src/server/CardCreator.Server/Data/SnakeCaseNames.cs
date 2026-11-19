using System.Text;
using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Data;

/// <summary>
/// Names our tables, columns, keys and indexes in snake_case, as in docs/spec.md section 2.
/// Applied to the model only, so EF's own <c>__EFMigrationsHistory</c> table keeps its
/// default shape and databases created by earlier versions still migrate. (The
/// EFCore.NamingConventions package renames that table's columns too, which breaks them.)
/// </summary>
public static class SnakeCaseNames
{
    public static void ApplySnakeCaseNames(this ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            entity.SetTableName(ToSnakeCase(entity.GetTableName()!));
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
            foreach (var key in entity.GetKeys())
            {
                key.SetName(ToSnakeCase(key.GetName()!));
            }
            foreach (var foreignKey in entity.GetForeignKeys())
            {
                foreignKey.SetConstraintName(ToSnakeCase(foreignKey.GetConstraintName()!));
            }
            foreach (var index in entity.GetIndexes())
            {
                index.SetDatabaseName(ToSnakeCase(index.GetDatabaseName()!));
            }
        }
    }

    public static string ToSnakeCase(string name)
    {
        var builder = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                var previous = i > 0 ? name[i - 1] : '_';
                var nextIsLower = i + 1 < name.Length && char.IsLower(name[i + 1]);
                if (previous != '_' && (char.IsLower(previous) || char.IsDigit(previous) || nextIsLower))
                {
                    builder.Append('_');
                }
                builder.Append(char.ToLowerInvariant(c));
            }
            else
            {
                builder.Append(c);
            }
        }
        return builder.ToString();
    }
}
