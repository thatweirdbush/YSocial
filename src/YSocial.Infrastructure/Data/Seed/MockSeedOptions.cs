namespace YSocial.Infrastructure.Data.Seed;

/// <summary>
/// Gate of the mock seed (accounts with well-known passwords): set BEFORE <see cref="MockDataStore"/> is first touched.
/// The API enables it in Development only; test resets always reseed.
/// </summary>
public static class MockSeedOptions
{
    public static bool Enabled { get; set; } = true;
}
