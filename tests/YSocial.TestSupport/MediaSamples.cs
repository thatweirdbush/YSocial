using System.Buffers.Binary;
using System.Text;

namespace YSocial.TestSupport;

/// <summary>
/// Minimal, header-correct sample files (only what the magic-byte sniffer and the dimension parsers read) with optional padding.
/// </summary>
public static class MediaSamples
{
    /// <summary>
    /// Marker text embedded in <see cref="Jpeg"/> when <c>withExifGps</c> is set (to prove stripping in the smoke).
    /// </summary>
    public const string GpsMarker = "GPSLatitude";

    public static byte[] Png(int width, int height, int padding = 0)
    {
        var bytes = new List<byte> { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        bytes.AddRange(BigEndian(13));
        bytes.AddRange(Encoding.ASCII.GetBytes("IHDR"));
        bytes.AddRange(BigEndian(width));
        bytes.AddRange(BigEndian(height));
        bytes.AddRange([8, 2, 0, 0, 0, 0, 0, 0, 0]);
        return Pad(bytes, padding);
    }

    public static byte[] Jpeg(int width, int height, bool withExifGps = false, int padding = 0, int app2Bytes = 0)
    {
        var bytes = new List<byte> { 0xFF, 0xD8 };

        if (withExifGps)
        {
            var exif = Encoding.ASCII.GetBytes($"Exif\0\0II*\0{GpsMarker}=10.77,106.70");
            bytes.AddRange([0xFF, 0xE1, (byte)((exif.Length + 2) >> 8), (byte)((exif.Length + 2) & 0xFF)]);
            bytes.AddRange(exif);
        }

        if (app2Bytes > 0)
        {
            // Big profile segment (e.g. ICC) in front of the frame header
            bytes.AddRange([0xFF, 0xE2, (byte)((app2Bytes + 2) >> 8), (byte)((app2Bytes + 2) & 0xFF)]);
            bytes.AddRange(new byte[app2Bytes]);
        }

        // SOF0: length 17, precision 8, height, width, 3 components
        bytes.AddRange([0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(height >> 8), (byte)(height & 0xFF), (byte)(width >> 8), (byte)(width & 0xFF), 0x03]);
        bytes.AddRange([1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
        return Pad(bytes, padding);
    }

    public static byte[] Gif(int width, int height, int padding = 0)
    {
        var bytes = new List<byte>(Encoding.ASCII.GetBytes("GIF89a"))
        {
            (byte)(width & 0xFF), (byte)(width >> 8), (byte)(height & 0xFF), (byte)(height >> 8), 0, 0, 0
        };
        bytes.Add(0x3B);
        return Pad(bytes, padding);
    }

    public static byte[] WebpLossy(int width, int height, int padding = 0)
    {
        var bytes = RiffHeader("VP8 ", 10);
        bytes.AddRange([0, 0, 0, 0x9D, 0x01, 0x2A, (byte)(width & 0xFF), (byte)(width >> 8), (byte)(height & 0xFF), (byte)(height >> 8)]);
        return Pad(bytes, padding);
    }

    public static byte[] WebpLossless(int width, int height, int padding = 0)
    {
        var bytes = RiffHeader("VP8L", 5);
        var bits = (uint)(width - 1) | ((uint)(height - 1) << 14);
        bytes.Add(0x2F);
        bytes.AddRange(BitConverter.GetBytes(bits));
        return Pad(bytes, padding);
    }

    public static byte[] WebpExtended(int width, int height, int padding = 0)
    {
        var bytes = RiffHeader("VP8X", 10);
        bytes.AddRange([0, 0, 0, 0]);
        bytes.AddRange(Le24(width - 1));
        bytes.AddRange(Le24(height - 1));
        return Pad(bytes, padding);
    }

    public static byte[] Mp4(int padding = 0) => Ftyp("isom", padding);

    public static byte[] Mov(int padding = 0) => Ftyp("qt  ", padding);

    public static byte[] WebM(int padding = 0) => Pad([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01, 0x42, 0xF2, 0x81], padding);

    public static byte[] Heic() => Ftyp("heic", 0);

    public static byte[] Avif() => Ftyp("avif", 0);

    public static byte[] Svg() => Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><script>alert(1)</script></svg>");

    public static byte[] Exe() => [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00];

    public static byte[] Text() => Encoding.UTF8.GetBytes("just some text, not media");

    private static byte[] Ftyp(string brand, int padding)
    {
        var bytes = new List<byte>();
        bytes.AddRange(BigEndian(24));
        bytes.AddRange(Encoding.ASCII.GetBytes("ftyp"));
        bytes.AddRange(Encoding.ASCII.GetBytes(brand));
        bytes.AddRange([0, 0, 2, 0]);
        bytes.AddRange(Encoding.ASCII.GetBytes("isom"));
        bytes.AddRange(Encoding.ASCII.GetBytes("mp41"));
        return Pad(bytes, padding);
    }

    private static List<byte> RiffHeader(string chunk, int chunkSize)
    {
        var bytes = new List<byte>(Encoding.ASCII.GetBytes("RIFF"));
        bytes.AddRange(BitConverter.GetBytes(4 + 8 + chunkSize));
        bytes.AddRange(Encoding.ASCII.GetBytes("WEBP"));
        bytes.AddRange(Encoding.ASCII.GetBytes(chunk));
        bytes.AddRange(BitConverter.GetBytes(chunkSize));
        return bytes;
    }

    private static byte[] BigEndian(int value)
    {
        var buffer = new byte[4];
        BinaryPrimitives.WriteInt32BigEndian(buffer, value);
        return buffer;
    }

    private static byte[] Le24(int value) => [(byte)(value & 0xFF), (byte)((value >> 8) & 0xFF), (byte)((value >> 16) & 0xFF)];

    private static byte[] Pad(List<byte> bytes, int padding)
    {
        if (padding > 0) bytes.AddRange(new byte[padding]);
        return [.. bytes];
    }
}
