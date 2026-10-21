using FluentAssertions;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Xunit;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Media;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.Media;

public class MediaAssetTests
{
    private static readonly UserId Owner = UserId.New();
    private static readonly UserId Stranger = UserId.New();
    private static readonly DateTime Now = new(2026, 10, 21, 12, 0, 0, DateTimeKind.Utc);

    private static MediaAsset Uploading(MediaPurpose? purpose = null)
        => MediaAsset.Create(Owner, MediaKind.Image, purpose ?? MediaPurpose.Post, "test");

    private static MediaAsset Pending(MediaPurpose? purpose = null)
    {
        var asset = Uploading(purpose);
        asset.MarkUploaded("https://res.cloudinary.com/demo/image/upload/a.jpg", null, 800, 600, null, 1234);
        return asset;
    }

    private static MediaAsset Attached()
    {
        var asset = Pending();
        asset.MarkAttached(Owner, MediaPurpose.Post);
        return asset;
    }

    private static void ShouldBreak(Action act, string code, RuleViolationKind kind)
    {
        var thrown = act.Should().Throw<BusinessRuleValidationException>().Which;
        var rule = thrown.BrokenRule.Should().BeAssignableTo<IClassifiedRule>().Subject;

        rule.Code.Should().Be(code);
        rule.Kind.Should().Be(kind);
    }

    #region Create
    [Fact]
    public void Create_StartsUploading_WithDeterministicPublicIdAndNoRemoteData()
    {
        var asset = MediaAsset.Create(Owner, MediaKind.Video, MediaPurpose.Post, "dev");

        asset.Status.Should().Be(MediaAssetStatus.Uploading);
        asset.PublicId.Should().Be($"ysocial/dev/posts/{asset.Id.Value:N}");
        asset.Url.Should().BeNull();
        asset.Bytes.Should().BeNull();
        asset.Version.Should().Be(0);
        asset.CleanupAttempts.Should().Be(0);
    }

    [Fact]
    public void Create_AvatarPurpose_UsesAvatarsFolder()
    {
        var asset = MediaAsset.Create(Owner, MediaKind.Image, MediaPurpose.Avatar, "prod");

        asset.PublicId.Should().Be($"ysocial/prod/avatars/{asset.Id.Value:N}");
    }
    #endregion

    #region Legal transitions
    [Fact]
    public void MarkUploaded_MovesToPending_FillsRemoteData_BumpsVersion()
    {
        var asset = Uploading();

        asset.MarkUploaded("https://res.cloudinary.com/demo/video/upload/a.mp4", "https://res.cloudinary.com/demo/video/upload/so_0/a.jpg", 1920, 1080, 12.5, 999);

        asset.Status.Should().Be(MediaAssetStatus.Pending);
        asset.Url.Should().EndWith("a.mp4");
        asset.PosterUrl.Should().EndWith("a.jpg");
        (asset.Width, asset.Height, asset.DurationSeconds, asset.Bytes).Should().Be((1920, 1080, 12.5, 999L));
        asset.Version.Should().Be(1);
    }

    [Fact]
    public void MarkAttached_ByOwner_MovesPendingToAttached()
    {
        var asset = Pending();

        asset.MarkAttached(Owner, MediaPurpose.Post);

        asset.Status.Should().Be(MediaAssetStatus.Attached);
        asset.Version.Should().Be(2);
    }

    [Fact]
    public void Release_MovesAttachedToReleased()
    {
        var asset = Attached();

        asset.Release();

        asset.Status.Should().Be(MediaAssetStatus.Released);
    }

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Pending")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public void Claim_FromEveryDeletableStatus_MovesToDeleting_StampsNow(string from)
    {
        var asset = At(from);
        var version = asset.Version;

        asset.Claim(Now);

        asset.Status.Should().Be(MediaAssetStatus.Deleting);
        asset.StatusChangedAt.Should().Be(Now);
        asset.Version.Should().Be(version + 1);
    }

    [Fact]
    public void Discard_OwnPending_MovesToDeleting()
    {
        var asset = Pending();

        asset.Discard(Owner, Now);

        asset.Status.Should().Be(MediaAssetStatus.Deleting);
        asset.StatusChangedAt.Should().Be(Now);
    }

    [Fact]
    public void RecordCleanupFailure_StaysDeleting_CountsAttempt_RestartsLease()
    {
        var asset = At("Deleting");
        var later = Now.AddMinutes(11);

        asset.RecordCleanupFailure(later);

        asset.Status.Should().Be(MediaAssetStatus.Deleting);
        asset.CleanupAttempts.Should().Be(1);
        asset.StatusChangedAt.Should().Be(later);
    }
    #endregion

    #region Illegal transitions
    [Theory]
    [InlineData("Pending")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public void MarkUploaded_OutsideUploading_IsConflict(string from)
        => ShouldBreak(() => At(from).MarkUploaded("u", null, 1, 1, null, 1), ErrorCodes.Conflict, RuleViolationKind.Conflict);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public void MarkAttached_NotPending_IsNotFound(string from)
        => ShouldBreak(() => At(from).MarkAttached(Owner, MediaPurpose.Post), ErrorCodes.NotFound, RuleViolationKind.NotFound);

    [Fact]
    public void MarkAttached_ByStranger_IsNotFound()
        => ShouldBreak(() => Pending().MarkAttached(Stranger, MediaPurpose.Post), ErrorCodes.NotFound, RuleViolationKind.NotFound);

    [Fact]
    public void MarkAttached_WrongPurpose_IsNotFound()
        => ShouldBreak(() => Pending(MediaPurpose.Avatar).MarkAttached(Owner, MediaPurpose.Post), ErrorCodes.NotFound, RuleViolationKind.NotFound);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Pending")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public void Release_NotAttached_IsConflict(string from)
        => ShouldBreak(() => At(from).Release(), ErrorCodes.Conflict, RuleViolationKind.Conflict);

    [Fact]
    public void Claim_Attached_IsConflict_AttachedIsNeverDeleted()
        => ShouldBreak(() => Attached().Claim(Now), ErrorCodes.Conflict, RuleViolationKind.Conflict);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public void Discard_NotPending_IsNotFound(string from)
        => ShouldBreak(() => At(from).Discard(Owner, Now), ErrorCodes.NotFound, RuleViolationKind.NotFound);

    [Fact]
    public void Discard_ByStranger_IsNotFound()
        => ShouldBreak(() => Pending().Discard(Stranger, Now), ErrorCodes.NotFound, RuleViolationKind.NotFound);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Pending")]
    [InlineData("Attached")]
    [InlineData("Released")]
    public void RecordCleanupFailure_NotDeleting_IsConflict(string from)
        => ShouldBreak(() => At(from).RecordCleanupFailure(Now), ErrorCodes.Conflict, RuleViolationKind.Conflict);
    #endregion

    #region Sweep eligibility
    // Cut-offs in the future make every row "old"; in the past none is
    private static MediaSweepWindow Window(DateTime cutOff) => new(cutOff, cutOff, cutOff, cutOff);

    [Theory]
    [InlineData("Uploading", true)]
    [InlineData("Pending", true)]
    [InlineData("Released", true)]
    [InlineData("Deleting", true)]
    [InlineData("Attached", false)]
    public void IsSweepable_WhenOlderThanCutOff_OnlyAttachedIsNever(string status, bool expected)
        => At(status).IsSweepable(Window(DateTime.UtcNow.AddHours(1))).Should().Be(expected);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Pending")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    [InlineData("Attached")]
    public void IsSweepable_WhenNewerThanCutOff_IsFalse(string status)
        => At(status).IsSweepable(Window(DateTime.UtcNow.AddHours(-1))).Should().BeFalse();

    [Fact]
    public void IsSweepable_UsesTheCutOffOfTheCurrentStatusOnly()
    {
        var old = DateTime.UtcNow.AddHours(1);
        var fresh = DateTime.UtcNow.AddHours(-1);

        Pending().IsSweepable(new MediaSweepWindow(old, fresh, old, old)).Should().BeFalse();
        Pending().IsSweepable(new MediaSweepWindow(fresh, old, fresh, fresh)).Should().BeTrue();
    }
    #endregion

    private static MediaAsset At(string status) => status switch
    {
        "Uploading" => Uploading(),
        "Pending" => Pending(),
        "Attached" => Attached(),
        "Released" => ReleasedAsset(),
        "Deleting" => DeletingAsset(),
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };

    private static MediaAsset ReleasedAsset()
    {
        var asset = Attached();
        asset.Release();
        return asset;
    }

    private static MediaAsset DeletingAsset()
    {
        var asset = Pending();
        asset.Claim(DateTime.UtcNow);
        return asset;
    }
}
