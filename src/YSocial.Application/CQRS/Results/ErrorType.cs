namespace YSocial.Application.CQRS.Results;

public enum ErrorType
{
    None,
    Validation,
    NotFound,
    Conflict,
    Business
}
