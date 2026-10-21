using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.CQRS.Behaviors.Logging;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Media;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Media.UploadMedia;

/// <param name="FileName">Only for messages; never reaches the remote key.</param>
/// <param name="Length">Declared size of the file (the framework buffered it already).</param>
/// <param name="OpenRead">Opens a fresh seekable stream; masked in logs, so a log line never touches the content.</param>
public sealed record UploadFile(string FileName, long Length, [property: SensitiveData] Func<Stream> OpenRead);

/// <param name="Purpose"><c>post</c> (default) | <c>avatar</c>, case-insensitive.</param>
public sealed record UploadMediaCommand(string? Purpose, IReadOnlyList<UploadFile> Files) : ResultCommand<IReadOnlyList<MediaDto>>;

internal sealed class UploadMediaCommandValidator : AbstractValidator<UploadMediaCommand>
{
    public UploadMediaCommandValidator()
    {
        RuleFor(command => command.Purpose)
            .Must(purpose => MediaPurposes.TryParse(purpose, out _))
            .WithMessage("'Purpose' must be 'post' or 'avatar'.");

        RuleFor(command => command.Files).Custom(ValidateFiles);
    }

    // Cheap checks first (count, declared sizes, aggregate), header sniffing last
    private static void ValidateFiles(IReadOnlyList<UploadFile> files, ValidationContext<UploadMediaCommand> context)
    {
        var purpose = MediaPurposes.TryParse(context.InstanceToValidate.Purpose, out var parsed) ? parsed : MediaPurpose.Post;

        if (files.Count is < 1 or > MediaLimits.MaxFilesPerRequest)
        {
            context.AddFailure(nameof(UploadMediaCommand.Files), $"Send 1 to {MediaLimits.MaxFilesPerRequest} files.");
            return;
        }

        if (purpose == MediaPurpose.Avatar && files.Count != 1)
        {
            context.AddFailure(nameof(UploadMediaCommand.Files), "An avatar is exactly 1 file.");
            return;
        }

        if (files.Sum(file => file.Length) > MediaLimits.MaxAggregateBytes)
        {
            context.AddFailure(nameof(UploadMediaCommand.Files), $"The files together must not exceed {MediaLimits.MaxAggregateBytes / (1024 * 1024)} MiB.");
            return;
        }

        foreach (var file in files)
        {
            var failure = Inspect(file, purpose);
            if (failure is not null)
            {
                context.AddFailure(nameof(UploadMediaCommand.Files), $"{file.FileName}: {failure}");
            }
        }
    }

    private static string? Inspect(UploadFile file, MediaPurpose purpose)
    {
        if (file.Length <= 0) return "the file is empty.";

        // Declared size first: an oversize file is never opened
        if (file.Length > MediaLimits.MaxVideoBytes) return "the file is too large.";

        var sniffed = Sniff(file);
        if (sniffed is null) return "unsupported file type (jpeg, png, gif, webp, mp4, mov and webm only).";

        if (sniffed.Kind == MediaKind.Video)
        {
            return purpose == MediaPurpose.Avatar ? "an avatar must be an image." : null;
        }

        if (file.Length > MediaLimits.MaxImageBytes) return $"an image must not exceed {MediaLimits.MaxImageBytes / (1024 * 1024)} MiB.";

        var (width, height) = (sniffed.Width ?? 0, sniffed.Height ?? 0);
        if (width <= 0 || height <= 0) return "the image has no readable size.";
        if (width > MediaLimits.MaxImageSide || height > MediaLimits.MaxImageSide || (long)width * height > MediaLimits.MaxPixels)
        {
            return $"the image is too big in pixels (max {MediaLimits.MaxImageSide}px per side and {MediaLimits.MaxPixels / 1_000_000} megapixels).";
        }

        return null;
    }

    private static SniffedMedia? Sniff(UploadFile file)
    {
        using var stream = file.OpenRead();
        return MediaSniffer.Detect(stream);
    }
}

internal static class MediaPurposes
{
    public static bool TryParse(string? value, out MediaPurpose purpose)
    {
        purpose = MediaPurpose.Post;

        if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "post", StringComparison.OrdinalIgnoreCase)) return true;

        if (!string.Equals(value, "avatar", StringComparison.OrdinalIgnoreCase)) return false;

        purpose = MediaPurpose.Avatar;
        return true;
    }
}

internal sealed class UploadMediaCommandHandler(
    IMediaAssetRepository assets,
    IUnitOfWork unitOfWork,
    IMediaStorage storage,
    IUserContext userContext,
    IMediaUploadGate gate,
    MediaOptions options,
    TimeProvider time,
    ILogger<UploadMediaCommandHandler> logger)
    : ICommandHandler<UploadMediaCommand, Result<IReadOnlyList<MediaDto>>>
{
    private static readonly TimeSpan CompensationBudget = TimeSpan.FromSeconds(10);

    public async Task<Result<IReadOnlyList<MediaDto>>> Handle(UploadMediaCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<IReadOnlyList<MediaDto>>.Unauthorized();
        }

        var ownerId = new UserId(userContext.UserId);
        MediaPurposes.TryParse(command.Purpose, out var purpose);

        using var lease = gate.TryEnter(ownerId) ?? throw new TooManyUploadsException();

        var sniffed = command.Files.Select(Sniff).ToList();

        // Tx 1: the rows exist BEFORE any remote file (write-ahead), under the quota token
        if (await assets.CountReservedAsync(ownerId, cancellationToken) + command.Files.Count > MediaLimits.MaxReservedPerUser)
        {
            return Result<IReadOnlyList<MediaDto>>.Validation($"At most {MediaLimits.MaxReservedPerUser} uploads can wait to be used. Use or remove some first.");
        }

        var rows = sniffed
            .Select(info => MediaAsset.Create(ownerId, info.Kind, purpose, options.Environment))
            .ToList();

        foreach (var row in rows)
        {
            await assets.AddAsync(row, cancellationToken);
        }

        if (!await assets.BumpQuotaTokenAsync(ownerId, cancellationToken))
        {
            return Result<IReadOnlyList<MediaDto>>.Unauthorized();
        }

        // Committed here, not by the pipeline: this state must outlive a failure of the upload (like the OTP attempt counter)
        await unitOfWork.CommitAsync(cancellationToken);

        try
        {
            var stored = new List<StoredMedia>();

            for (var i = 0; i < rows.Count; i++)
            {
                await using var content = command.Files[i].OpenRead();
                var result = await storage.UploadAsync(
                    new MediaUpload(rows[i].Id, rows[i].PublicId, rows[i].Kind, purpose, sniffed[i].ContentType, content),
                    cancellationToken);

                EnsureWithinVideoLimits(rows[i], result);
                stored.Add(result);
            }

            // Tx 2: every row becomes Pending in one save
            for (var i = 0; i < rows.Count; i++)
            {
                rows[i].MarkUploaded(stored[i].Url, stored[i].PosterUrl, stored[i].Width, stored[i].Height, stored[i].DurationSeconds, stored[i].Bytes);
            }

            await unitOfWork.CommitAsync(cancellationToken);

            return Result<IReadOnlyList<MediaDto>>.Success(rows.Select(MediaMapping.ToDto).ToList());
        }
        catch (Exception exception)
        {
            await CompensateAsync(rows);

            if (exception is MediaRejectedException rejected)
            {
                return Result<IReadOnlyList<MediaDto>>.Validation(rejected.Message);
            }

            throw;
        }
    }

    private static SniffedMedia Sniff(UploadFile file)
    {
        using var stream = file.OpenRead();
        return MediaSniffer.Detect(stream) ?? throw new InvalidOperationException("Unsupported media passed validation.");
    }

    private static void EnsureWithinVideoLimits(MediaAsset row, StoredMedia stored)
    {
        if (row.Kind != MediaKind.Video) return;

        if (stored.Width > MediaLimits.MaxVideoSide || stored.Height > MediaLimits.MaxVideoSide)
        {
            throw new MediaRejectedException($"A video must not exceed {MediaLimits.MaxVideoSide}px per side.");
        }

        if (stored.DurationSeconds > MediaLimits.MaxVideoSeconds)
        {
            throw new MediaRejectedException($"A video must not be longer than {MediaLimits.MaxVideoSeconds / 60:0} minutes.");
        }
    }

    /// <summary>
    /// Claim our rows, delete the remote files, remove the rows. Bounded and best effort: whatever fails stays
    /// <c>Deleting</c> (or <c>Uploading</c>) and the sweep finishes it, because the rows are already saved.
    /// </summary>
    private async Task CompensateAsync(IReadOnlyList<MediaAsset> rows)
    {
        using var budget = new CancellationTokenSource(CompensationBudget);

        try
        {
            var now = time.GetUtcNow().UtcDateTime;

            foreach (var row in rows.Where(r => r.Status != MediaAssetStatus.Deleting))
            {
                row.Claim(now);
            }

            await unitOfWork.CommitAsync(budget.Token);

            await storage.DeleteAsync(rows.Select(r => new StoredMediaRef(r.PublicId, r.Kind)).ToList(), budget.Token);

            foreach (var row in rows)
            {
                assets.Remove(row);
            }

            await unitOfWork.CommitAsync(budget.Token);
        }
        catch (Exception exception)
        {
            logger.LogWarning("Upload compensation incomplete ({ExceptionType}); the sweep will finish it", exception.GetType().Name);
        }
    }
}

internal static class MediaMapping
{
    public static MediaDto ToDto(MediaAsset asset)
        => new(asset.Id.Value, KindName(asset.Kind), asset.Url!, asset.PosterUrl, asset.Width!.Value, asset.Height!.Value, asset.DurationSeconds, asset.Bytes!.Value);

    public static string KindName(MediaKind kind) => kind == MediaKind.Video ? "video" : "image";
}
