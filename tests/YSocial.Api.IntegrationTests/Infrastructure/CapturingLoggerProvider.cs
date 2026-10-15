using Microsoft.Extensions.Logging;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Collects every formatted log message of the host (category, level, message incl. exception text).
/// </summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly object _gate = new();
    private readonly List<LogEntry> _entries = [];

    public sealed record LogEntry(string Category, LogLevel Level, string Message);

    public IReadOnlyList<LogEntry> Entries
    {
        get
        {
            lock (_gate)
            {
                return _entries.ToList();
            }
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _entries.Clear();
        }
    }

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(CapturingLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var message = formatter(state, exception) + (exception is null ? string.Empty : " | " + exception);
            lock (owner._gate)
            {
                owner._entries.Add(new LogEntry(category, logLevel, message));
            }
        }
    }
}
