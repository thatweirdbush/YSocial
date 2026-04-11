using Microservice.BuildingBlocks.Domain.ValueObjects;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public sealed record PasswordHash : ValueObject
{
    public string Value { get; }

    private PasswordHash(string value) => Value = value;

    public static PasswordHash Create(string hash)
    {
        CheckRule(new PasswordHashMustNotBeEmptyRule(hash));
        return new PasswordHash(hash);
    }
}
