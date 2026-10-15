---
module: Backend Decisions & Conventions
stack: C# / ASP.NET Core / Entity Framework Core / DDD
updated: 2026-10-02
---

# BACKEND DECISIONS & CONVENTIONS

## 1. Architectural Decisions
- **Soft delete over hard delete:** unfollow sets `IsDeleted = true` to preserve metadata (e.g. `IsCloseFriend`). Re-follow restores existing record -> prevents unique index conflicts
- **Aggregate segregation:** `UserBlock` = standalone Aggregate Root (separate from `UserRelation`) for max execution speed (e.g. `AnyAsync`) on high-frequency block checks
- **Idempotent commands (fail silently):** re-trigger (e.g. follow already-followed user) -> return Success immediately, no DB mutation
- **Query batching:** minimize DB round-trips via `Task.WhenAll()` & bidirectional queries (e.g. `GetBlocksBetweenAsync` checks A->B & B->A in 1 query)

## 2. Conventions
1. **Imports:** NEVER full namespace in code lines; MUST write `using` at file top
2. **Enumerations:** prefer `Enumeration` from `Microservice.BuildingBlocks.Domain.Enumerations` over standard `enum`
   - Pattern: `public sealed record FollowStatus(int Value, string Name) : Enumeration<FollowStatus>`
3. **Business Rules:** `internal sealed record` for `IBusinessRule`. Field order: `Message` -> `BrokenWhen`, separated by blank line
4. **Domain rule checks:** when `IBusinessRule` validated outside `AggregateRoot` at Domain layer -> use `Entity.CheckRule()`
5. **FluentValidation:**
   - Single rule & single option: inline (e.g. `RuleFor(x => x.PostId).NotEmpty();`)
   - Multiple rules/options: multi-line, 1 line per option
6. **StronglyTypedId:** ALWAYS enforce strongly-typed IDs for domain entities:
   ```csharp
   namespace YSocial.Domain.UserRelations;

   [StronglyTypedId(jsonConverter: StronglyTypedIdJsonConverter.SystemTextJson)]
   public partial struct UserRelationId;
   ```
7. **Async:** ALWAYS seek optimal async execution (e.g. `Task.WhenAll()`)
8. **User context:** ALWAYS use `IUserContext` in command handlers when accessing current user info
9. Comments, `<summary>` docs, property/class/method names: short, English
10. Line endings: CRLF
11. File-scoped namespaces (`namespace X;`)
12. Use `#region` to group members in large classes: Properties, ICommand, command handlers, events, constants...
13. Remove & sort usings at end of every task
14. Prefer `record` for simple classes with primitive types
