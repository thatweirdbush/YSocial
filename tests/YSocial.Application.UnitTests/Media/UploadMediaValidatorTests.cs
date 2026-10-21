using FluentAssertions;
using FluentValidation.Results;
using Xunit;
using YSocial.Application.Features.Media.UploadMedia;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

/// <summary>
/// The limit table of spec 2.1, row by row. Declared lengths are decoupled from the (header-only) bytes so 100 MiB rows cost nothing.
/// </summary>
public class UploadMediaValidatorTests
{
    private const long MiB = 1024 * 1024;

    private static UploadFile Sized(byte[] header, long length, string name = "f") => new(name, length, () => new MemoryStream(header));

    private static UploadFile Image(long length = 1000, int width = 800, int height = 600) => Sized(MediaSamples.Png(width, height), length);

    private static UploadFile Video(long length = 1000) => Sized(MediaSamples.Mp4(), length);

    private static ValidationResult Validate(string? purpose, params UploadFile[] files)
        => new UploadMediaCommandValidator().Validate(new UploadMediaCommand(purpose, files));

    private static void ShouldFailOn(ValidationResult result, string property)
        => result.Errors.Select(e => e.PropertyName).Should().Contain(property);

    #region Count & purpose
    [Fact]
    public void OneImage_Passes() => Validate(null, Image()).IsValid.Should().BeTrue();

    [Fact]
    public void TenImages_Pass() => Validate("post", Enumerable.Range(0, 10).Select(_ => Image()).ToArray()).IsValid.Should().BeTrue();

    [Fact]
    public void NoFiles_Fails() => ShouldFailOn(Validate("post"), "Files");

    [Fact]
    public void ElevenFiles_Fails() => ShouldFailOn(Validate("post", Enumerable.Range(0, 11).Select(_ => Image()).ToArray()), "Files");

    [Theory]
    [InlineData("POST")]
    [InlineData("Avatar")]
    [InlineData("post")]
    [InlineData("")]
    [InlineData(null)]
    public void PurposeIsCaseInsensitive_AndDefaultsToPost(string? purpose)
        => Validate(purpose, Image()).IsValid.Should().BeTrue();

    [Theory]
    [InlineData("cover")]
    [InlineData("posts")]
    [InlineData("1")]
    public void UnknownPurpose_Fails(string purpose) => ShouldFailOn(Validate(purpose, Image()), "Purpose");
    #endregion

    #region Avatar
    [Fact]
    public void Avatar_ExactlyOneImage_Passes() => Validate("avatar", Image()).IsValid.Should().BeTrue();

    [Fact]
    public void Avatar_TwoFiles_Fails() => ShouldFailOn(Validate("avatar", Image(), Image()), "Files");

    [Fact]
    public void Avatar_Video_Fails() => ShouldFailOn(Validate("avatar", Video()), "Files");
    #endregion

    #region Sizes
    [Fact]
    public void Image_AtTenMiB_Passes() => Validate("post", Image(10 * MiB)).IsValid.Should().BeTrue();

    [Fact]
    public void Image_OverTenMiB_Fails() => ShouldFailOn(Validate("post", Image(10 * MiB + 1)), "Files");

    [Fact]
    public void Video_At100MiB_PassesAlone() => Validate("post", Video(100 * MiB)).IsValid.Should().BeTrue();

    [Fact]
    public void Video_Over100MiB_Fails() => ShouldFailOn(Validate("post", Video(100 * MiB + 1)), "Files");

    [Fact]
    public void Aggregate_Over100MiB_Fails()
        => ShouldFailOn(Validate("post", Video(60 * MiB), Video(41 * MiB)), "Files");

    [Fact]
    public void Aggregate_Exactly100MiB_Passes()
        => Validate("post", Video(60 * MiB), Video(40 * MiB)).IsValid.Should().BeTrue();

    [Fact]
    public void TenImagesOfTenMiB_FitTheAggregate()
        => Validate("post", Enumerable.Range(0, 10).Select(_ => Image(10 * MiB)).ToArray()).IsValid.Should().BeTrue();

    [Fact]
    public void ImagePlusVideo_PassWhileTheSumFits()
        => Validate("post", Image(10 * MiB), Video(90 * MiB)).IsValid.Should().BeTrue();

    [Fact]
    public void ImagePlusVideo_FailWhenTheSumExceeds()
        => ShouldFailOn(Validate("post", Image(10 * MiB), Video(90 * MiB + 1)), "Files");

    [Fact]
    public void EmptyFile_Fails() => ShouldFailOn(Validate("post", Image(0)), "Files");
    #endregion

    #region Pixels
    [Fact]
    public void Image_At12000PerSide_UnderPixelCap_Passes() => Validate("post", Image(width: 12000, height: 4000)).IsValid.Should().BeTrue();

    [Fact]
    public void Image_SideOver12000_Fails() => ShouldFailOn(Validate("post", Image(width: 12001, height: 100)), "Files");

    [Fact]
    public void Image_Over50Megapixels_Fails() => ShouldFailOn(Validate("post", Image(width: 8000, height: 6251)), "Files");

    [Fact]
    public void Image_Exactly50Megapixels_Passes() => Validate("post", Image(width: 10000, height: 5000)).IsValid.Should().BeTrue();

    [Fact]
    public void Image_ZeroDimension_Fails() => ShouldFailOn(Validate("post", Image(width: 0, height: 100)), "Files");
    #endregion

    #region Content
    [Theory]
    [InlineData("svg")]
    [InlineData("heic")]
    [InlineData("exe")]
    [InlineData("text")]
    public void UnsupportedContent_Fails_WhateverTheName(string kind)
    {
        var bytes = kind switch { "svg" => MediaSamples.Svg(), "heic" => MediaSamples.Heic(), "exe" => MediaSamples.Exe(), _ => MediaSamples.Text() };

        ShouldFailOn(Validate("post", Sized(bytes, 5000, "totally-a-photo.png")), "Files");
    }

    [Fact]
    public void Result_MarksFirstErrorOnTheFilesKey_ForTheApiEnvelope()
        => Validate("post").Errors.Should().OnlyContain(e => e.PropertyName == "Files");
    #endregion
}
