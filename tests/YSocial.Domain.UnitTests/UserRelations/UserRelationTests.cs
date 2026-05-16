using FluentAssertions;
using Xunit;
using YSocial.Domain.UserRelations;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.UserRelations;

public sealed class UserRelationTests
{
    private static readonly UserId ObserverId = new(Guid.NewGuid());
    private static readonly UserId TargetId = new(Guid.NewGuid());

    private static UserRelation CreateRelation() => UserRelation.Create(ObserverId, TargetId);

    #region Create

    [Fact]
    public void Create_ShouldInitializeWithDefaults_WhenCalled()
    {
        // Act
        var relation = CreateRelation();

        // Assert
        relation.Id.Should().NotBe(default(UserRelationId));
        relation.ObserverId.Should().Be(ObserverId);
        relation.TargetId.Should().Be(TargetId);
        relation.FollowStatus.Should().Be(FollowStatus.None);
        relation.IsCloseFriend.Should().BeFalse();
        relation.IsMuted.Should().BeFalse();
        relation.IsDeleted.Should().BeFalse();
        relation.DeletedAt.Should().BeNull();
    }

    #endregion

    #region RequestFollow

    [Fact]
    public void RequestFollow_ShouldSetAccepted_WhenTargetIsPublic()
    {
        // Arrange
        var relation = CreateRelation();

        // Act
        relation.RequestFollow(isTargetPrivate: false);

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Accepted);
        relation.UpdatedAt.Should().NotBeNull();
        relation.DomainEvents.Should().ContainSingle(e => e is UserFollowAcceptedEvent);
    }

    [Fact]
    public void RequestFollow_ShouldSetPending_WhenTargetIsPrivate()
    {
        // Arrange
        var relation = CreateRelation();

        // Act
        relation.RequestFollow(isTargetPrivate: true);

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Pending);
        relation.UpdatedAt.Should().NotBeNull();
        relation.DomainEvents.Should().ContainSingle(e => e is UserFollowRequestedEvent);
    }

    [Fact]
    public void RequestFollow_ShouldBeIdempotent_WhenAlreadyAccepted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);
        relation.ClearDomainEvents();

        // Act
        relation.RequestFollow(isTargetPrivate: false);

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Accepted);
        relation.DomainEvents.Should().BeEmpty("no new events should be raised for idempotent operations");
    }

    [Fact]
    public void RequestFollow_ShouldBeIdempotent_WhenAlreadyPending()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: true);
        relation.ClearDomainEvents();

        // Act
        relation.RequestFollow(isTargetPrivate: true);

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Pending);
        relation.DomainEvents.Should().BeEmpty();
    }

    [Fact]
    public void RequestFollow_ShouldRestoreAndFollow_WhenPreviouslyDeleted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);
        relation.Delete();
        relation.ClearDomainEvents();

        // Act
        relation.RequestFollow(isTargetPrivate: false);

        // Assert
        relation.IsDeleted.Should().BeFalse();
        relation.DeletedAt.Should().BeNull();
        relation.FollowStatus.Should().Be(FollowStatus.Accepted);
        relation.DomainEvents.Should().ContainSingle(e => e is UserFollowAcceptedEvent);
    }

    #endregion

    #region AcceptFollow

    [Fact]
    public void AcceptFollow_ShouldSetAccepted_WhenPending()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: true);
        relation.ClearDomainEvents();

        // Act
        relation.AcceptFollow();

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Accepted);
        relation.DomainEvents.Should().ContainSingle(e => e is UserFollowAcceptedEvent);
    }

    [Fact]
    public void AcceptFollow_ShouldBeIdempotent_WhenAlreadyAccepted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false); // Already Accepted
        relation.ClearDomainEvents();

        // Act
        relation.AcceptFollow();

        // Assert
        relation.FollowStatus.Should().Be(FollowStatus.Accepted);
        relation.DomainEvents.Should().BeEmpty();
    }

    #endregion

    #region ToggleCloseFriend

    [Fact]
    public void ToggleCloseFriend_ShouldSetTrue_WhenFollowingAccepted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);

        // Act
        relation.ToggleCloseFriend(isCloseFriend: true);

        // Assert
        relation.IsCloseFriend.Should().BeTrue();
    }

    [Fact]
    public void ToggleCloseFriend_ShouldNotChange_WhenNotAccepted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: true); // Pending

        // Act
        relation.ToggleCloseFriend(isCloseFriend: true);

        // Assert
        relation.IsCloseFriend.Should().BeFalse("close friend requires Accepted status");
    }

    [Fact]
    public void ToggleCloseFriend_ShouldUnset_WhenCalledWithFalse()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);
        relation.ToggleCloseFriend(isCloseFriend: true);

        // Act
        relation.ToggleCloseFriend(isCloseFriend: false);

        // Assert
        relation.IsCloseFriend.Should().BeFalse();
    }

    #endregion

    #region ToggleMute

    [Fact]
    public void ToggleMute_ShouldSetTrue_WhenCalled()
    {
        // Arrange
        var relation = CreateRelation();

        // Act
        relation.ToggleMute(isMuted: true);

        // Assert
        relation.IsMuted.Should().BeTrue();
        relation.UpdatedAt.Should().NotBeNull();
    }

    #endregion

    #region Delete

    [Fact]
    public void Delete_ShouldSoftDelete_WhenActive()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);
        relation.ClearDomainEvents();

        // Act
        relation.Delete();

        // Assert
        relation.IsDeleted.Should().BeTrue();
        relation.DeletedAt.Should().NotBeNull();
    }

    [Fact]
    public void Delete_ShouldRaiseUnfollowedEvent_WhenWasAccepted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false); // Accepted
        relation.ClearDomainEvents();

        // Act
        relation.Delete();

        // Assert
        relation.DomainEvents.Should().ContainSingle(e => e is UserUnfollowedEvent);
    }

    [Fact]
    public void Delete_ShouldNotRaiseUnfollowedEvent_WhenWasPending()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: true); // Pending
        relation.ClearDomainEvents();

        // Act
        relation.Delete();

        // Assert
        relation.DomainEvents.Should().NotContain(e => e is UserUnfollowedEvent,
            "unfollowed event should only fire for accepted relations");
    }

    [Fact]
    public void Delete_ShouldBeIdempotent_WhenAlreadyDeleted()
    {
        // Arrange
        var relation = CreateRelation();
        relation.RequestFollow(isTargetPrivate: false);
        relation.Delete();
        relation.ClearDomainEvents();

        // Act
        relation.Delete();

        // Assert
        relation.DomainEvents.Should().BeEmpty("deleting an already deleted relation should not raise events");
    }

    #endregion
}
