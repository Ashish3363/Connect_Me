# Project Coding Standards & Guidelines

This document outlines the mandatory coding standards and principles that MUST be followed when developing or modifying code in this repository.

---

## 1. Use Enums / Constant Maps Instead of Magic Strings

> **Rule**: Never pass or compare raw magic string literals directly in code. Always define and use typed Enums or constant objects (`as const`).

### JavaScript / TypeScript (`.ts` / `.tsx` / `.js`)
```typescript
// BAD
if (status === 'granted') { ... }
mixpanel.track('Public Message Sent', { type: 'photo' });

// GOOD
export enum LocationStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
}

export const MESSAGE_TYPES = {
  TEXT: 'text',
  PHOTO: 'photo',
} as const;

if (status === LocationStatus.GRANTED) { ... }
mixpanel.track(ANALYTICS_EVENTS.PUBLIC_MESSAGE_SENT, { type: MESSAGE_TYPES.PHOTO });
```

### Python (`.py`)
```python
# BAD
if user_role == "admin": ...

# GOOD
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"

if user_role == UserRole.ADMIN: ...
```

---

## 2. Comprehensive & Explicit Error Handling

> **Rule**: Every network request, async call, file operation, or error-prone execution MUST be wrapped in explicit error handling constructs (`try/catch` or `try/except`). Silent swallows and unhandled promise rejections are strictly prohibited.

### JavaScript / TypeScript
```typescript
// BAD
const data = await fetchApi('/rooms');
setRooms(data);

// GOOD
try {
  const data = await fetchApi('/rooms');
  setRooms(data);
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : 'Failed to fetch rooms';
  console.error('Fetch rooms failed:', errorMessage);
  setError(errorMessage);
}
```

### Python
```python
# BAD
data = json.loads(payload)

# GOOD
try:
    data = json.loads(payload)
except json.JSONDecodeError as e:
    logger.error(f"Failed to parse payload: {e}")
    raise HTTPException(status_code=400, detail="Invalid JSON format")
```

---

## 3. Strict Input & Output Data Contracts (Typing & Schemas)

> **Rule**: Always explicitly declare input parameter types and return values for all functions, endpoints, and components.

### JavaScript / TypeScript
- Prefer TypeScript (`.ts` / `.tsx`) for all new modules, utility functions, components, and state definitions.
- Function arguments and return types MUST be explicitly typed.

```typescript
// BAD
function formatUser(user) {
  return user.firstName + ' ' + user.lastName;
}

// GOOD
export interface UserPayload {
  firstName: string;
  lastName: string;
  email: string;
}

export function formatUser(user: UserPayload): string {
  return `${user.firstName} ${user.lastName}`.trim();
}
```

### Python
- Use Python type hints (`def func(param: Type) -> ReturnType:`) across all functions.
- Use Pydantic models for API request bodies, response models, and service data contracts.

```python
# BAD
def create_room(data):
    return {"id": 1, "name": data["name"]}

# GOOD
from pydantic import BaseModel, Field

class CreateRoomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    lat: float
    lng: float

class RoomResponse(BaseModel):
    id: str
    name: str
    lat: float
    lng: float

def create_room(request: CreateRoomRequest) -> RoomResponse:
    # Function implementation with explicit return type contract
    ...
```
