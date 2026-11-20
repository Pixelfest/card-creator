using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CardCreator.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddArtworkFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "artwork_files",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(22)", maxLength: 22, nullable: false),
                    collection_id = table.Column<string>(type: "character varying(22)", maxLength: 22, nullable: false),
                    path = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    content_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_referenced_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_artwork_files", x => x.id);
                    table.ForeignKey(
                        name: "fk_artwork_files_collections_collection_id",
                        column: x => x.collection_id,
                        principalTable: "collections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_artwork_files_collection_id",
                table: "artwork_files",
                column: "collection_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "artwork_files");
        }
    }
}
