using Microsoft.EntityFrameworkCore;

namespace CardCreator.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options);
