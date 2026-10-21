using Xunit;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Every test starts from the identical seed.
/// </summary>
[Collection(ApiCollection.Name)]
public abstract class ApiTestBase
{
    protected ApiTestBase(ApiFixture fixture)
    {
        Factory = fixture.Factory;
        Store.Use(fixture.Database);
        Store.Reset();
        Factory.Logs.Clear();
        Factory.Storage.Reset();
        Client = Factory.CreateApiClient();
    }

    protected ApiFactory Factory { get; }

    /// <summary>
    /// Anonymous client.
    /// </summary>
    protected HttpClient Client { get; }

    protected Task<HttpClient> LoginAsync(string loginId, string password = Seed.Password)
        => AuthHelper.LoginAsync(Factory, loginId, password);
}
