using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.Api.IntegrationTests.Infrastructure;

public static class Seed
{
    public const string Password = SeedIds.TestPassword;
    public const string TestLogin = "test@example.com";
    public const string DemoLogin = "demo@example.com";
    public const string AdminLogin = "admin@admin.com";
}

public sealed record LoginTokens(string AccessToken, string RefreshToken);

public static class AuthHelper
{
    public static async Task<LoginTokens> RequestTokensAsync(HttpClient client, string loginId, string password, string deviceId = "tests")
    {
        var response = await client.PostAsJsonAsync("/api/identities/login", new { loginId, password, deviceId });
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return new LoginTokens(
            doc.RootElement.GetProperty("accessToken").GetString()!,
            doc.RootElement.GetProperty("refreshToken").GetString()!);
    }

    /// <summary>
    /// Logs in & returns a client carrying the bearer token.
    /// </summary>
    public static async Task<HttpClient> LoginAsync(ApiFactory factory, string loginId, string password = Seed.Password, string deviceId = "tests")
    {
        var anonymous = factory.CreateApiClient();
        var tokens = await RequestTokensAsync(anonymous, loginId, password, deviceId);

        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }
}
