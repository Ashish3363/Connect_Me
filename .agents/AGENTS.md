# Workspace Rules & Coding Standards

Refer to [coding_standard.md](file:///c:/Users/ashish/OneDrive/Desktop/PROJECTS/HYPERLOCAL_CHATAPP/coding_standard.md) for detailed guidelines.

## Mandatory Rules for All Code Modifications:

1. **Use Enums / Constant Maps over Raw Strings**:
   - Always use TypeScript `enum` / `as const` objects (JS/TS) or `enum.Enum` / `enum.StrEnum` (Python) instead of raw magic string literals.

2. **Explicit & Comprehensive Error Handling**:
   - Always wrap async calls, I/O, and API requests in `try/catch` (JS/TS) or `try/except` (Python). Provide fallback states or error handling; never swallow exceptions silently.

3. **Strict Input & Output Data Contracts (Typing & Schemas)**:
   - For JS/TS: Always specify parameter types and return types using TypeScript interfaces/types.
   - For Python: Always use type annotations (`def func(a: int) -> str:`) and Pydantic models for request payloads and API responses.
