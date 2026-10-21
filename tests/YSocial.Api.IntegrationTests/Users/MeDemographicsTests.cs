using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.Api.IntegrationTests.Users;

public class MeDemographicsTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly string[] Private = ["gender", "dateOfBirth", "email"];

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static Task<HttpResponseMessage> PutAsync(HttpClient client, int? gender, string? dateOfBirth)
        => client.PutAsJsonAsync("/api/users/profiles/me", new { displayName = "Test", gender, dateOfBirth });

    private static void AssertNoDemographics(JsonElement element)
    {
        foreach (var key in Private)
        {
            element.TryGetProperty(key, out _).Should().BeFalse($"'{key}' is owner-only");
        }
    }

    [Fact]
    public async Task Me_Defaults_GenderUnspecified_DobNull()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var me = await JsonAsync(await test.GetAsync("/api/users/me"));

        me.GetProperty("gender").GetString().Should().Be("unspecified");
        me.GetProperty("dateOfBirth").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task Me_AfterPut_ReturnsMaleAndDateOnly()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await PutAsync(test, 1, "1999-05-20T00:00:00Z")).StatusCode.Should().Be(HttpStatusCode.OK);
        var me = await JsonAsync(await test.GetAsync("/api/users/me"));

        me.GetProperty("gender").GetString().Should().Be("male");
        me.GetProperty("dateOfBirth").GetString().Should().Be("1999-05-20");
    }

    [Fact]
    public async Task Put_OmittedDemographics_KeepsStored()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await PutAsync(test, 2, "1999-05-20T00:00:00Z")).EnsureSuccessStatusCode();

        (await PutAsync(test, null, null)).EnsureSuccessStatusCode();
        var me = await JsonAsync(await test.GetAsync("/api/users/me"));

        me.GetProperty("gender").GetString().Should().Be("female");
        me.GetProperty("dateOfBirth").GetString().Should().Be("1999-05-20");
    }

    [Fact]
    public async Task Put_FutureDob_Returns400ValidationFailed()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var future = DateTime.UtcNow.Date.AddDays(2).ToString("yyyy-MM-dd") + "T00:00:00Z";

        var response = await PutAsync(test, null, future);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("ValidationFailed");
    }

    [Fact]
    public async Task ProfileDtos_NeverExposeDemographics()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await PutAsync(test, 1, "1999-05-20T00:00:00Z")).EnsureSuccessStatusCode();
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        AssertNoDemographics(await JsonAsync(await test.GetAsync($"/api/users/{SeedIds.TestUser.Value}")));
        AssertNoDemographics(await JsonAsync(await demo.GetAsync($"/api/users/{SeedIds.TestUser.Value}")));
        AssertNoDemographics(await JsonAsync(await demo.GetAsync("/api/users/by-username/test_user")));
        AssertNoDemographics((await JsonAsync(await test.GetAsync("/api/users/me"))).GetProperty("profile"));

        var followers = await JsonAsync(await test.GetAsync($"/api/users/{SeedIds.DemoUser.Value}/followers"));
        var items = followers.GetProperty("items").EnumerateArray().ToList();
        items.Should().NotBeEmpty();
        items.ForEach(AssertNoDemographics);
    }
}
