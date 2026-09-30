---
module: Backend Architecture & Conventions
stack: C# / ASP.NET Core / Entity Framework Core / DDD
---

# BACKEND ARCHITECTURE & CONVENTIONS

## 1. Solution Structure (Clean Architecture & DDD)
- **`Microservice.BuildingBlocks` (Shared Kernel):** Core base classes (`AggregateRoot`, `Entity`, `Result`, `IBusinessRule`, `ICommandHandler`, `Enumeration<T>`).
- **`YSocial.Domain`:** Pure business logic. Aggregates (`Account`, `User`, `UserRelation`, `UserBlock`), Value Objects, Domain Events & Business Rules. Zero external dependencies.
- **`YSocial.Application`:** CQRS via MediatR (Commands, Queries, Notification Handlers) + FluentValidation.
- **`YSocial.Infrastructure`:** Implements Domain/Application interfaces. `MockDataStore` (In-memory), `JwtProvider`, `BCryptPasswordHasher`, `MockEmailSender`. (Target migration: EF Core + PostgreSQL).
- **`YSocial.Api`:** RESTful Controllers inheriting `ApiController`, handles routing & maps `Result` pattern -> HTTP Status Codes.

## 2. Key Architectural Decisions
- **Soft Delete over Hard Delete:** Unfollow sets `IsDeleted = true` to preserve metadata (e.g., `IsCloseFriend`). Re-following restores the existing record to prevent unique index conflicts.
- **Aggregate Segregation:** `UserBlock` is a standalone Aggregate Root (separate from `UserRelation`) for maximum execution speed (`AnyAsync`) on high-frequency block checks.
- **Idempotent Commands (Fail Silently):** Re-triggering actions like follow on an already followed user returns Success immediately without DB mutation.
- **Query Batching:** Optimize DB round-trips using `Task.WhenAll()` & bidirectional queries (e.g., `GetBlocksBetweenAsync` checking both A->B & B->A in 1 query).

## 3. Conventions
1. **Imports:** NO full namespace in code lines; MUST write `using` at the top of the file.
2. **Enumerations:** Prefer `Enumeration` from `Microservice.BuildingBlocks.Domain.Enumerations` over standard `enum`.
   - Pattern: `public sealed record FollowStatus(int Value, string Name) : Enumeration<FollowStatus>`
3. **Business Rules:** Use `internal sealed record` for `IBusinessRule`. Order fields: `Message` -> `BrokenWhen`, separated by a blank line.
4. **Domain Rule Checks:** When an `IBusinessRule` needs validation outside `AggregateRoot` at Domain layer, use `Entity.CheckRule()`.
5. **Fluent Validation:**
   - Single Rule & Single Option: Keep inline (e.g., `RuleFor(x => x.PostId).NotEmpty();`).
   - Multiple Rules/Options: Multi-line, 1 line per option.
6. **StronglyTypedId:** Always enforce strongly-typed IDs for domain entities:
   ```csharp
   namespace YSocial.Domain.UserRelations;

   [StronglyTypedId(jsonConverter: StronglyTypedIdJsonConverter.SystemTextJson)]
   public partial struct UserRelationId;
7. **Async Optimization:** Always seek optimal async execution (e.g., Task.WhenAll()).
8. **User Context:** Always use IUserContext inside command handlers when accessing current user information.
9. Write comments, `<summary>` docs, & names of properties/classes/methods shortly in English.
10. Line endings: **CRLF**.
11. Use **file-scoped namespaces** (`namespace X;`).
12. Use `#region` to group members in large classes: Properties, ICommand, command handlers, events, constants...
13. **Remove & sort usings** at the end of every task.
14. Prefer `record` when adding simple classes with primitive types.