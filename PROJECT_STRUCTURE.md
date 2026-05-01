# Project Structure

This project has been restructured for better organization and maintainability.

## Directory Structure

```
src/
├── types/           # Centralized type definitions
│   ├── auth/        # Authentication-related types
│   ├── common/      # Common/shared types
│   └── dtos/        # Data Transfer Objects
├── utils/           # Utility functions
│   ├── crypto/      # Cryptographic utilities
│   └── string/      # String manipulation utilities
├── auth/            # Authentication module
├── common/          # Shared/common functionality
├── database/        # Database schemas and modules
├── sessions/        # Session management
└── users/           # User management
```

## Types Organization

### `src/types/auth/`

- `PublicUser`: User data exposed to clients
- `RequestWithUser`: Express request with authenticated user

### `src/types/common/`

- `ErrorCode`: Error code constants and types
- `ErrorResponse`: Standardized error response format

### `src/types/dtos/`

- `SignupDto`: User registration validation
- `SigninDto`: User login validation

## Utils Organization

### `src/utils/crypto/`

- `password.ts`: Password hashing and verification
- `token.ts`: Token generation
- `reset-token.ts`: Password reset token utilities
- `session.ts`: Session ID generation

### `src/utils/string/`

- `normalize.ts`: String normalization utilities

## Benefits

1. **Centralized Types**: All type definitions are now in one place, making them easier to find and maintain.
2. **Organized Utilities**: Utility functions are grouped by purpose, improving code reusability.
3. **Clear Separation**: DTOs are separated from business logic, following clean architecture principles.
4. **Backward Compatibility**: Old import paths still work through re-exports.
