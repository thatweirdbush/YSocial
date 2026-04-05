using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.CQRS.Results;

namespace YSocial.Application.CQRS.Requests;

/// <summary>
/// Abstract record, that encapsulate functionality of <see cref="CommandBase"/> with <see cref="Result"/> as the command execution result type.
/// </summary>
public abstract record ResultCommand : CommandBase<Result>;

/// <summary>
/// Abstract record, that encapsulate functionality of <see cref="CommandBase{TResult}"/> with <see cref="Result{T}"/> as the command execution result type.
/// </summary>
/// <typeparam name="TResult"><inheritdoc cref="CommandBase{TResult}" path="/typeparam"/></typeparam>
public abstract record ResultCommand<TResult> : CommandBase<Result<TResult>>;
