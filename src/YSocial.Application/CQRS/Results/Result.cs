namespace YSocial.Application.CQRS.Results;

public class Result
{
    public bool IsSuccess { get; }
    public string Error { get; } = string.Empty;
    public ErrorType ErrorType { get; }

    protected Result(bool isSuccess, string error, ErrorType errorType)
    {
        bool noError = string.IsNullOrWhiteSpace(error);

        if (isSuccess && !noError)
            throw new InvalidOperationException("Success result cannot have error");

        if (!isSuccess && noError)
            throw new InvalidOperationException("Failure must have error");

        IsSuccess = isSuccess;
        Error = error;
        ErrorType = errorType;
    }

    public static Result Success()
        => new(true, string.Empty, default);

    public static Result Fail(string error, ErrorType type = ErrorType.Business)
        => new(false, error, type);

    public static Result NotFound(string error = "Not found")
        => new(false, error, ErrorType.NotFound);

    public static Result Conflict(string error = "Conflict")
        => new(false, error, ErrorType.Conflict);

    public static Result Validation(string error)
        => new(false, error, ErrorType.Validation);

    public static Result Unauthorized(string error = "Unauthorized")
        => new(false, error, ErrorType.Unauthorized);

    public static Result Forbidden(string error = "Forbidden")
        => new(false, error, ErrorType.Forbidden);

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

    private Result(string error, ErrorType type)
        : base(false, error, type) { }

    public static Result<T> Success(T value)
        => new(value);

    public new static Result<T> Fail(string error, ErrorType type = ErrorType.Business)
        => new(error, type);

    public new static Result<T> NotFound(string error = "Not found")
        => new(error, ErrorType.NotFound);

    public new static Result<T> Conflict(string error = "Conflict")
        => new(error, ErrorType.Conflict);

    public new static Result<T> Validation(string error)
        => new(error, ErrorType.Validation);

    public new static Result<T> Unauthorized(string error = "Unauthorized")
        => new(error, ErrorType.Unauthorized);

    public new static Result<T> Forbidden(string error = "Forbidden")
        => new(error, ErrorType.Forbidden);

    public Result<K> Map<K>(Func<T, K> func)
    {
        return IsSuccess
            ? Result<K>.Success(func(Value))
            : Result<K>.Fail(Error, ErrorType);
    }

    public Result<K> Bind<K>(Func<T, Result<K>> func)
    {
        return IsSuccess
            ? func(Value)
            : Result<K>.Fail(Error, ErrorType);
    }
}
