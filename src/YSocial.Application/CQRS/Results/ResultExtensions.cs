namespace YSocial.Application.CQRS.Results;

public static class ResultExtensions
{
    public static async Task<Result<T>> ToResult<T>(this Task<T> task)
    {
        try
        {
            var result = await task;
            return Result<T>.Success(result);
        }
        catch (Exception ex)
        {
            return Result<T>.Fail(ex.Message, ErrorType.Business);
        }
    }
}
