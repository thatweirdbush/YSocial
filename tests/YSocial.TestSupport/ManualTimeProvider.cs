namespace YSocial.TestSupport;

/// <summary>
/// Clock that starts at the real time and only moves when a test advances it (sweep windows without waiting).
/// </summary>
public sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
