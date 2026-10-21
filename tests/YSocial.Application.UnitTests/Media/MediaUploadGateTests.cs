using FluentAssertions;
using Xunit;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Features.Media;
using YSocial.Domain.Users;

namespace YSocial.Application.UnitTests.Media;

public class MediaUploadGateTests
{
    private static readonly UserId A = UserId.New();
    private static readonly UserId B = UserId.New();

    [Fact]
    public void SecondEntryOfTheSameUser_IsRefused_UntilTheLeaseIsDisposed()
    {
        var gate = new MediaUploadGate(new MediaOptions());

        var lease = gate.TryEnter(A);
        gate.TryEnter(A).Should().BeNull();

        lease!.Dispose();
        gate.TryEnter(A).Should().NotBeNull();
    }

    [Fact]
    public void InstanceCap_LimitsUsersTogether_AndAFullGateKeepsNoUserSlot()
    {
        var gate = new MediaUploadGate(new MediaOptions { MaxConcurrentUploads = 1 });

        using var first = gate.TryEnter(A);
        gate.TryEnter(B).Should().BeNull();

        first!.Dispose();
        gate.TryEnter(B).Should().NotBeNull("the refused user was not left holding a slot");
    }

    [Fact]
    public void DisposingTwice_ReleasesOnce()
    {
        var gate = new MediaUploadGate(new MediaOptions { MaxConcurrentUploads = 1 });
        var lease = gate.TryEnter(A)!;

        lease.Dispose();
        lease.Dispose();

        using var again = gate.TryEnter(A);
        gate.TryEnter(B).Should().BeNull("a double dispose must not free a second slot");
    }
}
