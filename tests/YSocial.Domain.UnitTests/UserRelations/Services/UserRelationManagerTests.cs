using FluentAssertions;
using Microservice.BuildingBlocks.Domain.BusinessRules;
using Microservice.BuildingBlocks.Domain.Exceptions;
using NSubstitute;
using Xunit;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.UserRelations.Services;
using YSocial.Domain.Users;

namespace YSocial.Domain.UnitTests.UserRelations.Services;

public sealed class UserRelationManagerTests
{
    private readonly IUserRelationRepository _relationRepository = Substitute.For<IUserRelationRepository>();
    private readonly IUserBlockRepository _blockRepository = Substitute.For<IUserBlockRepository>();
    private readonly IUserRepository _userRepository = Substitute.For<IUserRepository>();
    private readonly UserRelationManager _sut;

    private static readonly UserId ObserverId = new(Guid.NewGuid());
    private static readonly UserId TargetId = new(Guid.NewGuid());

    public UserRelationManagerTests()
    {
        _sut = new UserRelationManager(_relationRepository, _blockRepository, _userRepository);
    }

    private User CreateTargetUser(bool isPrivate = false, bool isDeleted = false)
    {
        var user = User.Create(
            new AccountId(Guid.NewGuid()),
            "targetuser",
            Country.Vietnam);

        if (isPrivate)
        {
            user.UpdatePrivacySettings(new PrivacySettings(
                isPrivateProfile: true,
                allowDirectMessages: true,
                showActivityStatus: true));
        }

        if (isDeleted)
        {
            user.Delete(isAccountDeletion: true);
        }

        return user;
    }

    private void SetupDefaultMocks(User? targetUser = null, UserRelation? existingRelation = null, UserBlock? observerBlockedTarget = null, UserBlock? targetBlockedObserver = null)
    {
        targetUser ??= CreateTargetUser();

        _userRepository.GetByIdAsync(TargetId, Arg.Any<CancellationToken>())
            .Returns(targetUser);

        _blockRepository.GetBlocksBetweenAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns((observerBlockedTarget, targetBlockedObserver));

        _relationRepository.GetRelationAsync(ObserverId, TargetId, true, Arg.Any<CancellationToken>())
            .Returns(existingRelation);
    }

    #region FollowUserAsync

    [Fact]
    public async Task FollowUserAsync_ShouldCreateAndFollow_WhenNoExistingRelation()
    {
        // Arrange
        SetupDefaultMocks();

        // Act
        var result = await _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().NotBeNull();
        result.FollowStatus.Should().Be(FollowStatus.Accepted);
        await _relationRepository.Received(1).AddAsync(Arg.Any<UserRelation>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task FollowUserAsync_ShouldReuseRelation_WhenDeletedRelationExists()
    {
        // Arrange
        var existingRelation = UserRelation.Create(ObserverId, TargetId);
        existingRelation.RequestFollow(isTargetPrivate: false);
        existingRelation.Delete(); // Soft delete

        SetupDefaultMocks(existingRelation: existingRelation);

        // Act
        var result = await _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().BeSameAs(existingRelation);
        result.IsDeleted.Should().BeFalse("relation should be restored");
        result.FollowStatus.Should().Be(FollowStatus.Accepted);
        await _relationRepository.DidNotReceive().AddAsync(Arg.Any<UserRelation>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task FollowUserAsync_ShouldThrowBusinessRuleException_WhenFollowingSelf()
    {
        // Act
        var act = () => _sut.FollowUserAsync(ObserverId, ObserverId);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*cannot follow yourself*");
    }

    [Fact]
    public async Task FollowUserAsync_ShouldThrowEntityNotFoundException_WhenTargetNotFound()
    {
        // Arrange
        _userRepository.GetByIdAsync(TargetId, Arg.Any<CancellationToken>())
            .Returns((User?)null);

        _blockRepository.GetBlocksBetweenAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(((UserBlock?)null, (UserBlock?)null));

        _relationRepository.GetRelationAsync(ObserverId, TargetId, true, Arg.Any<CancellationToken>())
            .Returns((UserRelation?)null);

        // Act
        var act = () => _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        await act.Should().ThrowAsync<EntityNotFoundException>();
    }

    [Fact]
    public async Task FollowUserAsync_ShouldThrowBusinessRuleException_WhenTargetIsDeleted()
    {
        // Arrange
        var deletedUser = CreateTargetUser(isDeleted: true);
        SetupDefaultMocks(targetUser: deletedUser);

        // Act
        var act = () => _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*deleted user*");
    }

    [Fact]
    public async Task FollowUserAsync_ShouldThrowBusinessRuleException_WhenObserverBlockedTarget()
    {
        // Arrange
        var block = UserBlock.Create(ObserverId, TargetId);
        SetupDefaultMocks(observerBlockedTarget: block);

        // Act
        var act = () => _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*blocked*");
    }

    [Fact]
    public async Task FollowUserAsync_ShouldThrowBusinessRuleException_WhenTargetBlockedObserver()
    {
        // Arrange
        var block = UserBlock.Create(TargetId, ObserverId);
        SetupDefaultMocks(targetBlockedObserver: block);

        // Act
        var act = () => _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*cannot follow*");
    }

    [Fact]
    public async Task FollowUserAsync_ShouldSetPending_WhenTargetIsPrivate()
    {
        // Arrange
        var privateUser = CreateTargetUser(isPrivate: true);
        SetupDefaultMocks(targetUser: privateUser);

        // Act
        var result = await _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        result.FollowStatus.Should().Be(FollowStatus.Pending);
        result.DomainEvents.Should().Contain(e => e is UserFollowRequestedEvent);
    }

    [Fact]
    public async Task FollowUserAsync_ShouldSetAccepted_WhenTargetIsPublic()
    {
        // Arrange
        SetupDefaultMocks();

        // Act
        var result = await _sut.FollowUserAsync(ObserverId, TargetId);

        // Assert
        result.FollowStatus.Should().Be(FollowStatus.Accepted);
        result.DomainEvents.Should().Contain(e => e is UserFollowAcceptedEvent);
    }

    #endregion

    #region UnfollowUserAsync

    [Fact]
    public async Task UnfollowUserAsync_ShouldSoftDelete_WhenRelationExists()
    {
        // Arrange
        var relation = UserRelation.Create(ObserverId, TargetId);
        relation.RequestFollow(isTargetPrivate: false);

        _relationRepository.GetRelationAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(relation);

        // Act
        var result = await _sut.UnfollowUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().NotBeNull();
        result!.IsDeleted.Should().BeTrue();
    }

    [Fact]
    public async Task UnfollowUserAsync_ShouldReturnNull_WhenNoRelation()
    {
        // Arrange
        _relationRepository.GetRelationAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns((UserRelation?)null);

        // Act
        var result = await _sut.UnfollowUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().BeNull();
    }

    #endregion

    #region BlockUserAsync

    [Fact]
    public async Task BlockUserAsync_ShouldCreateBlock_WhenNotBlocked()
    {
        // Arrange
        _blockRepository.GetBlockAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns((UserBlock?)null);

        // Act
        var result = await _sut.BlockUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().NotBeNull();
        result.ObserverId.Should().Be(ObserverId);
        result.TargetId.Should().Be(TargetId);
        await _blockRepository.Received(1).AddAsync(Arg.Any<UserBlock>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task BlockUserAsync_ShouldReturnExisting_WhenAlreadyBlocked()
    {
        // Arrange
        var existingBlock = UserBlock.Create(ObserverId, TargetId);
        _blockRepository.GetBlockAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(existingBlock);

        // Act
        var result = await _sut.BlockUserAsync(ObserverId, TargetId);

        // Assert
        result.Should().BeSameAs(existingBlock);
        await _blockRepository.DidNotReceive().AddAsync(Arg.Any<UserBlock>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task BlockUserAsync_ShouldThrowBusinessRuleException_WhenBlockingSelf()
    {
        // Act
        var act = () => _sut.BlockUserAsync(ObserverId, ObserverId);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*cannot block yourself*");
    }

    #endregion

    #region UnblockUserAsync

    [Fact]
    public async Task UnblockUserAsync_ShouldRemoveBlock_WhenBlockExists()
    {
        // Arrange
        var block = UserBlock.Create(ObserverId, TargetId);
        _blockRepository.GetBlockAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(block);

        // Act
        await _sut.UnblockUserAsync(ObserverId, TargetId, CancellationToken.None);

        // Assert
        _blockRepository.Received(1).Remove(block);
    }

    [Fact]
    public async Task UnblockUserAsync_ShouldDoNothing_WhenNotBlocked()
    {
        // Arrange
        _blockRepository.GetBlockAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns((UserBlock?)null);

        // Act
        var act = () => _sut.UnblockUserAsync(ObserverId, TargetId, CancellationToken.None);

        // Assert
        await act.Should().NotThrowAsync();
        _blockRepository.DidNotReceive().Remove(Arg.Any<UserBlock>());
    }

    [Fact]
    public async Task UnblockUserAsync_ShouldThrowBusinessRuleException_WhenUnblockingSelf()
    {
        // Act
        var act = () => _sut.UnblockUserAsync(ObserverId, ObserverId, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*cannot block yourself*");
    }

    #endregion

    #region ToggleCloseFriendAsync

    [Fact]
    public async Task ToggleCloseFriendAsync_ShouldToggle_WhenFollowingAccepted()
    {
        // Arrange
        var relation = UserRelation.Create(ObserverId, TargetId);
        relation.RequestFollow(isTargetPrivate: false); // Accepted

        _relationRepository.GetRelationAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(relation);

        // Act
        await _sut.ToggleCloseFriendAsync(ObserverId, TargetId, isCloseFriend: true, CancellationToken.None);

        // Assert
        relation.IsCloseFriend.Should().BeTrue();
    }

    [Fact]
    public async Task ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenNotFollowing()
    {
        // Arrange
        var relation = UserRelation.Create(ObserverId, TargetId);
        // FollowStatus = None (not following)

        _relationRepository.GetRelationAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns(relation);

        // Act
        var act = () => _sut.ToggleCloseFriendAsync(ObserverId, TargetId, isCloseFriend: true, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*must be following*");
    }

    [Fact]
    public async Task ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenRelationNull()
    {
        // Arrange
        _relationRepository.GetRelationAsync(ObserverId, TargetId, Arg.Any<CancellationToken>())
            .Returns((UserRelation?)null);

        // Act
        var act = () => _sut.ToggleCloseFriendAsync(ObserverId, TargetId, isCloseFriend: true, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BusinessRuleValidationException>()
            .WithMessage("*must be following*");
    }

    #endregion
}
