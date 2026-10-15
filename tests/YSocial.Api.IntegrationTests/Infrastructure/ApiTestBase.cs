using Xunit;
using YSocial.Infrastructure.Data;

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
        MockDataStore.ResetForTests();
        Factory.Logs.Clear();
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
