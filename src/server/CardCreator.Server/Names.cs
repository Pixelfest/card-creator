namespace CardCreator.Server;

/// <summary>Rules shared by Collection and Set names.</summary>
public static class Names
{
    public const int MaxLength = 200;

    /// <summary>Trims the name; null when it is blank or longer than <see cref="MaxLength"/>.</summary>
    public static string? Normalize(string? raw)
    {
        var name = raw?.Trim();
        return string.IsNullOrEmpty(name) || name.Length > MaxLength ? null : name;
    }

    public static IResult Invalid() =>
        Results.ValidationProblem(
            new Dictionary<string, string[]>
            {
                ["name"] = [$"The name must be 1 to {MaxLength} characters."],
            }
        );

    /// <summary>"Name (copy)", shortening the original so the result still fits.</summary>
    public static string CopyOf(string name)
    {
        const string suffix = " (copy)";
        var room = MaxLength - suffix.Length;
        return (name.Length > room ? name[..room].TrimEnd() : name) + suffix;
    }
}

public static class Problems
{
    public static IResult NotFound(string what) =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: $"{what} not found.");
}
