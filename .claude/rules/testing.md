---
paths:
  - "client/__tests__/**/*.ts"
  - "server/tests/**/*.py"
---

# Testing Rules

- Use descriptive test names: "should [expected] when [condition]"
- Mock external dependencies, not internal modules
- Clean up side effects after each test (or the entire suite when appropriate).
- If functionality is hard to test, tell me about it
