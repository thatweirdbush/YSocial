using FluentAssertions;
using Xunit;
using YSocial.Domain.Identities;
using YSocial.Infrastructure.Identity;

namespace YSocial.Application.UnitTests.Identity;

public class AccountSessionLockTests
{
    [Fact]
    public async Task AccountSessionLock_SameAccountSerialized_DifferentAccountsParallel()
    {
        var sessionLock = new AccountSessionLock();
        var accountA = AccountId.New();
        var accountB = AccountId.New();

        var held = await sessionLock.AcquireAsync(accountA);
        var sameAccount = sessionLock.AcquireAsync(accountA);
        var otherAccount = await sessionLock.AcquireAsync(accountB); // must not wait

        await Task.Delay(50);
        sameAccount.IsCompleted.Should().BeFalse("same account is serialized");

        await held.DisposeAsync();
        await using var second = await sameAccount.WaitAsync(TimeSpan.FromSeconds(2));
        await otherAccount.DisposeAsync();
    }

    [Fact]
    public async Task AccountSessionLock_DoubleDispose_ReleasesOnce()
    {
        var sessionLock = new AccountSessionLock();
        var account = AccountId.New();

        var first = await sessionLock.AcquireAsync(account);
        await first.DisposeAsync();
        await first.DisposeAsync();

        var second = await sessionLock.AcquireAsync(account);
        var third = sessionLock.AcquireAsync(account);
        await Task.Delay(50);

        third.IsCompleted.Should().BeFalse("a double dispose must not release someone else's hold");
        await second.DisposeAsync();
        await (await third.WaitAsync(TimeSpan.FromSeconds(2))).DisposeAsync();
    }
}
