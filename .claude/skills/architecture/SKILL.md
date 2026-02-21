---
name: architecture
description: Guides the design of safely disposable code through contracts (traits/interfaces) and dependency inversion. Use when designing new modules, refactoring existing code, or making architectural decisions about component boundaries.
---

# Safely Disposable Code via Contracts

Every implementation should be disposable. The system's correctness is defined by its contracts, not by any particular implementation behind them.

## Core Principle

> Define **what** a component does (contract), not **how** it does it (implementation).
> Any implementation that satisfies the contract is interchangeable.

A component is "safely disposable" when:
1. Its behavior is fully described by a contract (trait, interface, protocol)
2. No consumer depends on implementation details
3. It can be deleted and rewritten from the contract alone without breaking the system

## Workflow

### Step 1: Define the Contract

Start with the contract. Write the trait/interface **before** any implementation.

**Rust:**
```rust
pub trait UserRepository {
    fn find_by_id(&self, id: UserId) -> Result<Option<User>, RepoError>;
    fn save(&self, user: &User) -> Result<(), RepoError>;
}
```

**Go:**
```go
type UserRepository interface {
    FindByID(ctx context.Context, id UserID) (*User, error)
    Save(ctx context.Context, user *User) error
}
```

**TypeScript:**
```typescript
interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

Rules:
- Keep contracts small (1-5 methods)
- Name contracts after the **role**, not the implementation (e.g., `UserRepository`, not `PostgresUserStore`)
- Define contracts where they are **consumed**, not where they are implemented
- Use domain types in signatures, not infrastructure types

### Step 2: Define Error Contracts

Errors are part of the contract. Define domain-level error types that hide infrastructure details.

```rust
#[derive(Debug, thiserror::Error)]
pub enum RepoError {
    #[error("entity not found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("internal error")]
    Internal(#[source] Box<dyn std::error::Error + Send + Sync>),
}
```

The `Internal` variant wraps infrastructure errors without leaking them into the contract.

### Step 3: Implement Against the Contract

Each implementation is a disposable artifact. Write it knowing it can be thrown away.

```rust
pub struct PgUserRepository {
    pool: PgPool,
}

impl UserRepository for PgUserRepository {
    fn find_by_id(&self, id: UserId) -> Result<Option<User>, RepoError> {
        // Postgres-specific code here.
        // This entire struct is disposable.
    }

    fn save(&self, user: &User) -> Result<(), RepoError> {
        // ...
    }
}
```

### Step 4: Depend on Contracts, Not Implementations

Consumers accept the contract, never the concrete type.

```rust
pub struct UserService<R: UserRepository> {
    repo: R,
}

impl<R: UserRepository> UserService<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub fn get_user(&self, id: UserId) -> Result<Option<User>, RepoError> {
        self.repo.find_by_id(id)
    }
}
```

In Go, this is implicit — accept the interface:

```go
func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}
```

### Step 5: Test Against the Contract

Write tests that verify the contract, not the implementation. These tests can be reused across implementations.

```rust
// A test suite that works for ANY UserRepository implementation.
fn test_repository_contract(repo: &impl UserRepository) {
    let user = User::new("test@example.com");
    repo.save(&user).unwrap();

    let found = repo.find_by_id(user.id()).unwrap();
    assert_eq!(found, Some(user));
}

#[test]
fn pg_repo_satisfies_contract() {
    let repo = PgUserRepository::new(test_pool());
    test_repository_contract(&repo);
}

#[test]
fn in_memory_repo_satisfies_contract() {
    let repo = InMemoryUserRepository::new();
    test_repository_contract(&repo);
}
```

## Layered Architecture

Organize code so that dependencies always point inward toward the domain:

```
src/
├── domain/          # Contracts + domain types (zero external deps)
│   ├── model.rs     #   Domain entities and value objects
│   ├── repo.rs      #   Repository contracts (traits)
│   └── service.rs   #   Domain services using contracts
├── infra/           # Disposable implementations
│   ├── pg_repo.rs   #   Postgres implementation
│   └── http.rs      #   HTTP handlers
└── main.rs          # Wiring (connects contracts to implementations)
```

- `domain/` defines contracts and types. It imports **nothing** from `infra/`.
- `infra/` implements contracts. It imports from `domain/`.
- `main.rs` wires implementations to contracts.

## Disposability Checklist

Before considering a component done, verify:

- [ ] A contract (trait/interface) exists and lives in the domain layer
- [ ] The contract is named after the role, not the technology
- [ ] Errors are domain-level, not infrastructure-level
- [ ] Consumers depend on the contract, not the implementation
- [ ] The implementation can be deleted without changing any consumer code
- [ ] Contract-level tests exist and can run against any implementation
- [ ] No implementation details leak through the contract (e.g., SQL types, HTTP types)

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Fat contract | 10+ methods, hard to implement | Split into focused contracts |
| Leaky contract | Infrastructure types in signatures | Use domain types only |
| Concrete dependency | Consumer imports the struct directly | Accept the trait/interface |
| God module | One module does everything | Extract contracts and split |
| Premature abstraction | Contract with only one possible implementation forever | Wait until there's a reason to abstract |

## When NOT to Abstract

Not everything needs a contract. Skip abstraction when:
- The component is a pure function with no side effects
- There will genuinely never be an alternative implementation
- The "contract" would be a trivial 1:1 mirror of a standard library type
- You're early in exploration and the boundary isn't clear yet

Start concrete, extract a contract when the second use case appears or when you need testability.
