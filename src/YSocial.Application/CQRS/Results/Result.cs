using YSocial.Domain.Common.Errors;

namespace YSocial.Application.CQRS.Results;

public class Result
{
    public bool IsSuccess { get; }
    public string Error { get; } = string.Empty;
    public ErrorType ErrorType { get; }

    /// <summary>
    /// Stable error code (empty on success).
    /// </summary>
    public string Code { get; } = string.Empty;

    protected Result(bool isSuccess, string error, ErrorType errorType, string? code = null)
    {
        bool noError = string.IsNullOrWhiteSpace(error);

        if (isSuccess && !noError)
            throw new InvalidOperationException("Success result cannot have error");

        if (!isSuccess && noError)
            throw new InvalidOperationException("Failure must have error");

        IsSuccess = isSuccess;
        Error = error;
        ErrorType = errorType;
        Code = isSuccess ? string.Empty : code ?? DefaultCode(errorType);
    }

    /// <summary>
    /// Default code of an <see cref="CQRS.Results.ErrorType"/>.
    /// </summary>
    public static string DefaultCode(ErrorType errorType) => errorType switch
    {
        ErrorType.Validation => ErrorCodes.ValidationFailed,
        ErrorType.Business => ErrorCodes.BusinessRuleViolated,
        ErrorType.Unauthorized => ErrorCodes.Unauthenticated,
        ErrorType.Forbidden => ErrorCodes.Forbidden,
        ErrorType.NotFound => ErrorCodes.NotFound,
        ErrorType.Conflict => ErrorCodes.Conflict,
        _ => ErrorCodes.InternalError
    };

    public static Result Success()
        => new(true, string.Empty, default);

    public static Result Fail(string error, ErrorType type = ErrorType.Business, string? code = null)
        => new(false, error, type, code);

    public static Result NotFound(string error = "Not found", string? code = null)
        => new(false, error, ErrorType.NotFound, code);

    public static Result Conflict(string error = "Conflict", string? code = null)
        => new(false, error, ErrorType.Conflict, code);

    public static Result Validation(string error, string? code = null)
        => new(false, error, ErrorType.Validation, code);

    public static Result Unauthorized(string error = "Unauthorized", string? code = null)
        => new(false, error, ErrorType.Unauthorized, code);

    public static Result Forbidden(string error = "Forbidden", string? code = null)
        => new(false, error, ErrorType.Forbidden, code);

    public TResult Match<TResult>(
        Func<TResult> onSuccess,
        Func<string, ErrorType, TResult> onFailure)
    {
        return IsSuccess
            ? onSuccess()
            : onFailure(Error, ErrorType);
    }
}

public class Result<T> : Result
{
    public T Value { get; } = default!;

    private Result(T value) : base(true, string.Empty, default)
    {
        Value = value;
    }

    private Result(string error, ErrorType type, string? code)
        : base(false, error, type, code) { }

    public static Result<T> Success(T value)
        => new(value);

    public new static Result<T> Fail(string error, ErrorType type = ErrorType.Business, string? code = null)
        => new(error, type, code);

    public new static Result<T> NotFound(string error = "Not found", string? code = null)
        => new(error, ErrorType.NotFound, code);

    public new static Result<T> Conflict(string error = "Conflict", string? code = null)
        => new(error, ErrorType.Conflict, code);

    public new static Result<T> Validation(string error, string? code = null)
        => new(error, ErrorType.Validation, code);

    public new static Result<T> Unauthorized(string error = "Unauthorized", string? code = null)
        => new(error, ErrorType.Unauthorized, code);

    public new static Result<T> Forbidden(string error = "Forbidden", string? code = null)
        => new(error, ErrorType.Forbidden, code);

    public Result<K> Map<K>(Func<T, K> func)
    {
        return IsSuccess
            ? Result<K>.Success(func(Value))
            : Result<K>.Fail(Error, ErrorType, Code);
    }

    public Result<K> Bind<K>(Func<T, Result<K>> func)
    {
        return IsSuccess
            ? func(Value)
            : Result<K>.Fail(Error, ErrorType, Code);
    }
}
