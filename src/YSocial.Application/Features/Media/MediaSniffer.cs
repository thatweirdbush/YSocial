using System.Buffers.Binary;
using System.Text;
using YSocial.Domain.Media;

namespace YSocial.Application.Features.Media;

/// <param name="Width">Header-parsed pixels; null for videos (checked from the provider response).</param>
public sealed record SniffedMedia(MediaKind Kind, string ContentType, int? Width, int? Height);

/// <summary>
/// Decides kind, mime and pixel size from MAGIC BYTES only: the declared content type and the file name are never trusted.
/// Accepts jpeg/png/gif/webp images and mp4/mov/webm videos; SVG, HEIC/AVIF and everything else is null.
/// </summary>
internal static class MediaSniffer
{
    private const int HeaderBytes = 32;

    // Image brands inside an ISO box file (HEIC/AVIF live in the same container as mp4)
    private static readonly HashSet<string> ImageBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"];

    /// <summary>
    /// Reads the header from the current position of a SEEKABLE stream and rewinds it to the start.
    /// </summary>
    public static SniffedMedia? Detect(Stream stream)
    {
        var start = stream.Position;

        try
        {
            var header = new byte[HeaderBytes];
            var read = ReadFully(stream, header);
            stream.Position = start;

            if (read < 12) return null;

            if (header.AsSpan(0, 8).SequenceEqual<byte>([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return Png(header, read);
            if (header[0] == 0xFF && header[1] == 0xD8) return Jpeg(stream, start);
            if (Ascii(header, 0, 3) == "GIF" && (Ascii(header, 3, 3) is "87a" or "89a")) return Gif(header);
            if (Ascii(header, 0, 4) == "RIFF" && Ascii(header, 8, 4) == "WEBP") return Webp(header, read);
            if (header.AsSpan(0, 4).SequenceEqual<byte>([0x1A, 0x45, 0xDF, 0xA3])) return new SniffedMedia(MediaKind.Video, "video/webm", null, null);
            if (Ascii(header, 4, 4) == "ftyp") return IsoVideo(header);

            return null;
        }
        finally
        {
            stream.Position = start;
        }
    }

    #region Formats
    private static SniffedMedia? Png(byte[] header, int read)
    {
        // 8 signature + 4 length + "IHDR" + width + height
        if (read < 24 || Ascii(header, 12, 4) != "IHDR") return null;

        return Image("image/png", BinaryPrimitives.ReadInt32BigEndian(header.AsSpan(16)), BinaryPrimitives.ReadInt32BigEndian(header.AsSpan(20)));
    }

    private static SniffedMedia Gif(byte[] header)
        => Image("image/gif", BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(6)), BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(8)));

    private static SniffedMedia? Webp(byte[] header, int read)
    {
        if (read < 21) return null;

        switch (Ascii(header, 12, 4))
        {
            case "VP8 " when read >= 30 && header[23] == 0x9D && header[24] == 0x01 && header[25] == 0x2A:
                return Image("image/webp", BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(26)) & 0x3FFF, BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(28)) & 0x3FFF);
            case "VP8L" when read >= 25 && header[20] == 0x2F:
                var bits = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(21));
                return Image("image/webp", (int)(bits & 0x3FFF) + 1, (int)((bits >> 14) & 0x3FFF) + 1);
            case "VP8X" when read >= 30:
                return Image("image/webp", Le24(header, 24) + 1, Le24(header, 27) + 1);
            default:
                return null;
        }
    }

    // Walks the segments (seeking over payloads) until a frame header; a profile of any size cannot hide the dimensions
    private static SniffedMedia? Jpeg(Stream stream, long start)
    {
        stream.Position = start + 2;
        var buffer = new byte[4];

        while (true)
        {
            // Skip fill bytes up to the next marker
            int marker;
            do
            {
                marker = stream.ReadByte();
                if (marker < 0) return null;
            }
            while (marker != 0xFF);

            do
            {
                marker = stream.ReadByte();
                if (marker < 0) return null;
            }
            while (marker == 0xFF);

            if (marker is 0xD8 or 0x01 or (>= 0xD0 and <= 0xD7)) continue;
            if (marker is 0xD9 or 0xDA) return null; // end of image / scan without a frame header

            if (ReadFully(stream, buffer.AsSpan(0, 2)) < 2) return null;
            var length = BinaryPrimitives.ReadUInt16BigEndian(buffer);
            if (length < 2) return null;

            var isFrame = marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC;
            if (!isFrame)
            {
                stream.Seek(length - 2, SeekOrigin.Current);
                continue;
            }

            if (length < 7 || ReadFully(stream, buffer.AsSpan(0, 1)) < 1 || ReadFully(stream, buffer) < 4) return null;

            return Image("image/jpeg", BinaryPrimitives.ReadUInt16BigEndian(buffer.AsSpan(2)), BinaryPrimitives.ReadUInt16BigEndian(buffer));
        }
    }

    private static SniffedMedia? IsoVideo(byte[] header)
    {
        var brand = Ascii(header, 8, 4);
        if (ImageBrands.Contains(brand.Trim().ToLowerInvariant())) return null;

        return new SniffedMedia(MediaKind.Video, brand.StartsWith("qt", StringComparison.Ordinal) ? "video/quicktime" : "video/mp4", null, null);
    }
    #endregion

    private static SniffedMedia Image(string contentType, int width, int height) => new(MediaKind.Image, contentType, width, height);

    private static int Le24(byte[] bytes, int offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

    private static string Ascii(byte[] bytes, int offset, int count) => Encoding.ASCII.GetString(bytes, offset, count);

    private static int ReadFully(Stream stream, Span<byte> buffer)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = stream.Read(buffer[total..]);
            if (read == 0) break;
            total += read;
        }

        return total;
    }
}
