using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Countries;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Identities;

public class RegisterTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private Task<HttpResponseMessage> RegisterAsync(string email = "newuser@example.com", string username = "new_user", string? phone = null)
        => Client.PostAsJsonAsync("/api/identities/register", new { email, password = "Password123!", username, phoneNumber = phone });

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Register_WithUsername_ProfileHasUsername()
    {
        var response = await RegisterAsync(username: "chosen.name_1");

        response.IsSuccessStatusCode.Should().BeTrue();
        Store.Users.Values.Should().ContainSingle(u => u.Username == "chosen.name_1" && u.IsDefault);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("TEST_USER")]
    [InlineData("has space")]
    [InlineData("emoji😀name")]
    [InlineData("0123456789012345678901234567890")]
    public async Task Register_InvalidUsernameFormat_Returns400_NotChecksUniqueness(string username)
    {
        // "TEST_USER" differs from the taken "test_user" only by case: format wins, no uniqueness lookup
        var response = await RegisterAsync(username: username);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await JsonAsync(response);
        body.GetProperty("code").GetString().Should().Be("ValidationFailed");
        body.GetProperty("errors").TryGetProperty("username", out _).Should().BeTrue();
        Store.Accounts.Should().HaveCount(3);
    }

    [Fact]
    public async Task Register_MissingUsername_Returns400()
    {
        var response = await Client.PostAsJsonAsync("/api/identities/register", new { email = "newuser@example.com", password = "Password123!" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Register_DuplicateUsername_Returns409()
    {
        var response = await RegisterAsync(username: "test_user");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("UsernameTaken");
    }

    [Fact]
    public async Task Register_DuplicateUsernameCaseInsensitive_Returns409()
    {
        var mixed = User.Create(SeedIds.AdminAccount, "Mixed.Case", Country.Vietnam);
        mixed.ClearDomainEvents();
        Store.Users.TryAdd(mixed.Id, mixed);

        var response = await RegisterAsync(username: "mixed.case");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("UsernameTaken");
    }

    [Fact]
    public async Task Register_UsernameOfSoftDeletedProfile_Returns409()
    {
        Store.Users.Update(SeedIds.TestUserAlt, x => x.Delete(isAccountDeletion: true));

        var response = await RegisterAsync(username: "test_user_alt");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var response = await RegisterAsync(email: "TEST@example.com", username: "someone_else");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("EmailTaken");
    }

    [Fact]
    public async Task Register_Failure_LeavesNoOrphanAccount()
    {
        await RegisterAsync(username: "test_user"); // duplicate username
        await RegisterAsync(email: "other@example.com", username: "valid_name", phone: "not-a-phone"); // account rule fails

        Store.Accounts.Should().HaveCount(3);
        Store.Users.Should().HaveCount(4);
        Store.Accounts.Values.Should().NotContain(a => a.Email == "other@example.com");
    }

    [Fact]
    public async Task Register_ThenLogin_ByUsername_Works()
    {
        (await RegisterAsync(username: "fresh.user")).EnsureSuccessStatusCode();

        var client = await LoginAsync("fresh.user", "Password123!");

        client.DefaultRequestHeaders.Authorization.Should().NotBeNull();
    }
}
