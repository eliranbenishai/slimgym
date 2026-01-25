# slimgym

An indentation-based configuration format with block strings, arrays, comments, type inference, and bidirectional conversion.

## Installation

```bash
bun add slimgym    # or npm/pnpm/yarn
```

Works with Bun and Node.js (v18+). For syntax highlighting, install the [SlimGym VS Code extension](https://marketplace.visualstudio.com/items?itemName=eliranbenishai.slimgym).

## Quick Start

```typescript
import sg from 'slimgym'

// Parse a string
const parsed = sg.parse(`
app
  name "MyApp"
  port 8080
  tags ["web", "api"]
`)

// Fetch from a file (sync or async)
const fromFile = sg.file('./config.sg')
const fromFileAsync = await sg.fileAsync('./config.sg')

// Fetch from a URL
const fromUrl = await sg.fetch('https://example.com/config.sg')

// Convert back to SlimGym format
const str = sg.slimgify({ name: "MyApp", port: 8080 })
```

## Features

- **Indentation-based syntax** - Clean, readable structure
- **Type inference** - Numbers, booleans, dates, null detected automatically
- **Block strings** - Multi-line strings with `"""`
- **Arrays** - Inline `[a, b]` or multi-line format
- **Comments** - Lines starting with `#`
- **Repeated keys** - Automatically converted to arrays
- **Forced arrays** - `[]key` syntax for single-item arrays
- **File imports** - `@"path"` and `@@"path"` syntax
- **File fetching** - Read files with `file()`, `fileAsync()`, and fetch URLs with `fetch()`
- **Bidirectional** - Convert objects back with `slimgify()`

## Syntax Guide

### Basic Values

```slimgym
name "John"           # String
age 30                # Number
active true           # Boolean
score null            # Null
date 2025-06-15       # Date (ISO format)
```

### Nested Objects

```slimgym
database
  host "localhost"
  port 5432
  credentials
    username "admin"
    password "secret"
```

### Arrays

```slimgym
# Inline
tags ["frontend", "react", "typescript"]

# Multi-line
dependencies [
  "react"
  "typescript"
]

# Empty
empty []
```

### Block Strings

```slimgym
description """
  Multi-line text that preserves
  formatting and "quotes" without escaping.
"""
```

### Comments

```slimgym
# Full line comment
name "MyApp"  # Inline comment
```

### Repeated Keys (Auto-Arrays)

```slimgym
item
  name "First"
item
  name "Second"
# Result: { item: [{ name: "First" }, { name: "Second" }] }
```

### Forced Arrays

```slimgym
[]items
  id 1234
# Result: { items: [{ id: 1234 }] }
```

### File Imports

```slimgym
# Import entire file as object
config @"./settings.sg"

# Unwrap single-key array (@@)
items @@"./list.sg"
```

## API

### `parse<T>(input: string, options?): T`

Parse a SlimGym string into a JavaScript object.

```typescript
const config = sg.parse<MyConfig>(`name "App"`)
```

**Options:** `baseDir`, `maxDepth` (default: 100), `maxArraySize` (default: 10000), `maxImportDepth` (default: 10). Set limits to `0` or `Infinity` to disable.

### `parseStream<T>(input: AsyncIterable<string | Uint8Array>, options?): Promise<T>`

Parse a stream of chunks/lines into a JavaScript object (useful for very large files).

```typescript
import { createReadStream } from 'node:fs'
import { parseStream } from 'slimgym/parse'

const stream = createReadStream('./config.sg')
const config = await parseStream(stream)
```

### `file<T>(filePath, options?)` / `fileAsync<T>(filePath, options?)`

Read and parse a SlimGym file (sync or async).

```typescript
const config = sg.file('./config.sg')
const config = await sg.fileAsync('./config.sg', { sandboxDir: '/app' })
```

**Additional options:** `sandboxDir` (restricts file access to prevent path traversal)

### `fetch<T>(url: string, options?): Promise<T>`

Fetch and parse from a URL.

```typescript
const config = await sg.fetch('https://example.com/config.sg', {
  headers: { 'Authorization': 'Bearer token' },
  allowedHosts: ['example.com']  // SSRF prevention
})

// With timeout
const config = await sg.fetch('https://example.com/config.sg', {
  signal: AbortSignal.timeout(5000)
})
```

**Options:** `headers`, `signal` (AbortSignal for cancellation/timeout), `method`, `baseUrl`, `allowedHosts`

### `slimgify(obj: any): string`

Convert a JavaScript object to SlimGym format.

```typescript
sg.slimgify({ app: { name: 'MyApp', tags: ['web'] } })
// app
//   name "MyApp"
//   tags ["web"]
```

### `$find(query, options?)` / `$findAll(query, options?)`

Search by key path with optional regex patterns. `$find` returns first match, `$findAll` returns all as `{ key, value }[]`.

```typescript
config.$find('user.personalInfo.firstName')  // Exact path → "John"
config.$find('Name$')                         // Regex: keys ending with "Name"
config.$find('user.\\w+.firstName')           // Regex: any intermediate key

config.$findAll('Name$')  // All matches → [{ key: '...', value: '...' }, ...]
```

**Pattern notes:** Use `\\w+` (not `.+`) to match any key since `.` is the path separator. **Options:** `depth` limits search depth.

### `$findValue(pattern, options?)` / `$findAllValues(pattern, options?)`

Search by **value** instead of key. Returns `{ key, value }` or array of matches.

```typescript
config.$findValue('@example\\.com')   // First value matching pattern
config.$findAllValues('^active$')     // All values matching pattern
```

### `$forEach(callback)`

Iterate over root object keys or array elements: `(value, key, parent) => void`

```typescript
config.$forEach((value, key) => console.log(`${key}: ${value}`))
```

### `$clone(query?, options?)`

Deep clone the entire object or a portion using `$find` syntax:

```typescript
const copy = config.$clone()              // Full deep copy
const tags = config.$clone('user.tags')   // Clone only matching portion
```

### `$merge(override)`

Deep merge another object into this one. Override values take precedence at any depth. Returns a new wrapped config (chainable).

```typescript
const base = sg.file('./base.sg')
const overrides = sg.file('./overrides.sg')
const config = base.$merge(overrides)

// Chain multiple overrides
const config = base
  .$merge(sg.file('./env/production.sg'))
  .$merge({ database: { port: 5433 } })
```

**Merge behavior:**
- Plain objects are recursively merged at all depths
- Arrays, primitives, Dates, and null replace entirely (not merged)
- Keys only in base are preserved
- Keys only in override are added

### `$mergeJSON(json)`

Same as `$merge`, but accepts a JSON string instead of an object. Throws `ParseError` for invalid JSON or non-object JSON values.

```typescript
const config = base.$mergeJSON('{"database": {"port": 5433}}')

// Chain with $merge
const config = base
  .$merge(sg.file('./env/production.sg'))
  .$mergeJSON(process.env.CONFIG_OVERRIDES ?? '{}')
```

### `$freeze()`

Recursively freeze the object (immutable). Returns self for chaining.

```typescript
config.$freeze()  // All mutations now throw in strict mode
```

> **Note:** Method names use `$` prefix because `$` isn't valid in SlimGym keys—no collision with your data.

## TypeScript

All methods support generics: `sg.parse<Config>(...)`, `sg.file<Config>(...)`, etc.

## Tree-Shaking

```typescript
import { parse, file } from 'slimgym/parse'
import { slimgify } from 'slimgym/slimgify'
```

## Error Handling

Catch `ParseError` for file/parse errors. Includes `message`, `lineNumber`, `columnNumber`, and a `codeFrame` when applicable.

```typescript
import sg, { ParseError } from 'slimgym'

try {
  sg.parse(`user\n  name "Jane"\n  []__proto__ 1`)
} catch (error) {
  if (error instanceof ParseError) {
    console.error(error.message)
  }
}
```

Output:

```text
Forbidden key "__proto__" (potential prototype pollution) at line 3, column 5
3 |   []__proto__ 1
  |     ^
```

> Note: `file()` / `fileAsync()` and `@` imports are server-only and throw `ParseError` in browser environments.

## Security

Built-in protections for untrusted input:

- **Prototype pollution** – Keys like `__proto__`, `constructor`, `prototype` are blocked
- **Path traversal** – Use `sandboxDir` to restrict file access
- **SSRF prevention** – Use `allowedHosts` to restrict URL fetching
- **DoS protection** – `maxDepth`, `maxArraySize`, `maxImportDepth` limits (set to `0` or `Infinity` to disable)

## Use Cases

**i18n / localization** - Structured translations with block strings for long copy and/or markdown.

**CMS content** - Static pages with metadata + content in one human-editable file.

**Multi-environment config** - Compose a base config and override per environment using `@` imports.

**Test fixtures** - Keep readable test data and API mock responses; compose fixtures with forced arrays and imports.

**Game content** - Dialogue, quests, item databases—friendly for writers/designers to edit safely.

**AI prompt templates** - Store system prompts, few-shot examples, and long multi-line instructions with block strings (no escaping).

## Development

```bash
bun install && bun run build && bun test
```

Node.js works too—just use `npm install` / `npm run build` / `npx vitest run`.

## License

MIT
