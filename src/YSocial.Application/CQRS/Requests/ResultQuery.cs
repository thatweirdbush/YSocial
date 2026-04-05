using Microservice.BuildingBlocks.CQRS.Requests;
using YSocial.Application.CQRS.Results;

namespace YSocial.Application.CQRS.Requests;

/// <summary>
/// Abstract record, that encapsulate functionality of <see cref="RequestBase{TResult}"/>, that return <see cref="Result{T}"/> as a result of execution.
/// </summary>
/// <typeparam name="TResult"><inheritdoc cref="RequestBase{TResult}" path="/typeparam"/></typeparam>
public abstract record ResultQuery<TResult> : RequestBase<Result<TResult>>;
