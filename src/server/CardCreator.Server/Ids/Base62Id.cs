using System.Numerics;
using System.Security.Cryptography;

namespace CardCreator.Server.Ids;

/// <summary>
/// Ids for Collections, Sets and Cards: 128 random bits written in base62, always 22 characters
/// (62^22 &gt; 2^128). A Collection id is the only key to it, so it must be unguessable.
/// </summary>
public static class Base62Id
{
    public const int Length = 22;
    private const string Alphabet =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    public static string New()
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);
        var value = new BigInteger(bytes, isUnsigned: true);

        Span<char> chars = stackalloc char[Length];
        for (var i = Length - 1; i >= 0; i--)
        {
            chars[i] = Alphabet[(int)(value % 62)];
            value /= 62;
        }
        return new string(chars);
    }

    public static bool IsValid(string? id) =>
        id is { Length: Length } && id.All(char.IsAsciiLetterOrDigit);
}
