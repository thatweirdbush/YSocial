using Xunit;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// One host for the whole run.
/// </summary>
public sealed class ApiFixture : IDisposable
{
    public ApiFixture()
    {
        Database = new SqliteTestDatabase();
        Store.Use(Database);
        Factory = new ApiFactory(Database);
    }

    public SqliteTestDatabase Database { get; }

    public ApiFactory Factory { get; }

    public void Dispose()
    {
        Factory.Dispose();
        Database.Dispose();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "Api";
}
