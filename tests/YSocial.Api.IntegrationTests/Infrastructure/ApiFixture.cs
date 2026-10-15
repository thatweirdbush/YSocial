using Xunit;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// One host for the whole run.
/// </summary>
public sealed class ApiFixture : IDisposable
{
    public ApiFactory Factory { get; } = new();

    public void Dispose() => Factory.Dispose();
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "Api";
}
