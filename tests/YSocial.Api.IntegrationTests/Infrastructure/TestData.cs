using System.Net.Http.Json;
using System.Text.Json;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Small helpers for seeding data through the public API.
/// </summary>
public static class TestData
{
    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    /// <summary>
    /// Id of a created entity: <c>id</c> of a DTO body.
    /// </summary>
    public static Guid AsId(this JsonElement body) => body.GetProperty("id").GetGuid();

    public static async Task<Guid> AddCommentAsync(this HttpClient client, Guid postId, string content = "comment", Guid? parentId = null)
    {
        var response = await client.PostAsJsonAsync("/api/comments", new { postId, content, parentCommentId = parentId });
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync()).AsId();
    }

    public static async Task<Guid> CreatePostAsync(this HttpClient client, string content = "post")
    {
        var response = await client.PostAsJsonAsync("/api/posts", new { content });
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync()).AsId();
    }
}
