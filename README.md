# slimgym

An indentation-based configuration format that combines clean syntax with modern features like block strings, arrays, comments, type inference, and bidirectional conversion.

## Installation

Works with both Bun and Node.js (v18+):

```bash
bun add slimgym
# or
npm install slimgym
# or
pnpm add slimgym
```

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

**Options:**
- `baseDir` - Base directory for `@` imports (default: `process.cwd()`)
- `maxDepth` - Maximum nesting depth (default: 100, set to 0 or `Infinity` to disable)
- `maxArraySize` - Maximum array size (default: 10000, set to 0 or `Infinity` to disable)
- `maxImportDepth` - Maximum `@` import chain depth (default: 10, set to 0 or `Infinity` to disable)

### `file<T>(filePath: string, options?): T`

Read and parse a SlimGym file synchronously.

```typescript
const config = sg.file('./config.sg')
const config = sg.file('config.sg', { baseDir: '/app', sandboxDir: '/app' })
```

**Options:**
- `baseDir` - Base directory for relative paths (default: `process.cwd()`)
- `sandboxDir` - Restrict file access to this directory (prevents path traversal)
- `maxDepth`, `maxArraySize`, `maxImportDepth` - Same as `parse()`

### `fileAsync<T>(filePath: string, options?): Promise<T>`

Read and parse a SlimGym file asynchronously.

```typescript
const config = await sg.fileAsync('./config.sg')
const config = await sg.fileAsync('config.sg', { baseDir: '/app', sandboxDir: '/app' })
```

**Options:** Same as `file()`

### `fetch<T>(url: string, options?): Promise<T>`

Fetch and parse a SlimGym file from a URL using Node's native `fetch`.

```typescript
const config = await sg.fetch('https://example.com/config.sg')

// With authentication header
const config = await sg.fetch('https://api.example.com/config.sg', {
  headers: { 'Authorization': 'Bearer token123' }
})

// With timeout using AbortSignal
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)
const config = await sg.fetch('https://example.com/config.sg', {
  signal: controller.signal
})

// Restrict to allowed hosts (SSRF prevention)
const config = await sg.fetch('https://cdn.example.com/config.sg', {
  allowedHosts: ['cdn.example.com']
})
```

**Options:**
- `headers` - HTTP headers to include in the request
- `signal` - AbortSignal for request cancellation/timeout
- `method` - HTTP method (`'GET'`, `'HEAD'`, or `'OPTIONS'`). Defaults to `'GET'`
- `baseUrl` - Base URL for resolving `@` imports within the content
- `allowedHosts` - Restrict fetching to these hostnames (prevents SSRF)
- `maxDepth`, `maxArraySize`, `maxImportDepth` - Same as `parse()`

### `slimgify(obj: any): string`

Convert a JavaScript object to SlimGym format.

```typescript
const str = sg.slimgify({
  app: { name: 'MyApp', tags: ['web'] }
})
// app
//   name "MyApp"
//   tags ["web"]
```

Multi-line strings automatically become block strings. Large arrays use multi-line format.

### `$find(query, options?)`

Search for a value using a query string with optional wildcard patterns:

```typescript
const config = sg.parse(`
user
  personalInfo
    firstName "John"
    lastName "Doe"
  workInfo
    companyName "ACME"
`)

// Exact path
config.$find('user.personalInfo.firstName') // "John"

// Wildcard: *suffix matches keys ending with pattern
config.$find('*Name')                        // "John" (first match at any depth)
config.$find('user.workInfo.*Name')          // "ACME"

// Wildcard: prefix* matches keys starting with pattern
config.$find('first*')                       // "John"

// Wildcard: *infix* matches keys containing pattern
config.$find('*Name*')                       // "John"

// Single wildcard matches any key
config.$find('user.*.firstName')             // "John"
```

**Options:**
- `depth` - Maximum depth to search (default: `Infinity`)

```typescript
config.$find('*Name', { depth: 2 }) // Only search 2 levels deep
```

### `$findAll(query, options?)`

Like `$find`, but returns **all** matches as an array of `{ key, value }` objects:

```typescript
const config = sg.parse(`
user1
  firstName "Alice"
user2
  firstName "Bob"
`)

config.$findAll('*Name')
// [
//   { key: 'user1.firstName', value: 'Alice' },
//   { key: 'user2.firstName', value: 'Bob' }
// ]
```

The `key` field contains the full path to the match, including array indices when searching through arrays.

**Options:** Same as `$find` — use `depth` to limit search depth.

### `$clone()`

### `$clone(query?, options?)`

Parsed objects include a `$clone()` method that creates a deep, completely decoupled copy. You can also pass the same selector syntax as `$find` to clone just a portion of the parsed config:

```typescript
const config = sg.parse(`
user
  name "John"
  tags ["admin", "active"]
`)

const copy = config.$clone()

// Modifications to the clone don't affect the original
copy.user.name = "Jane"
copy.user.tags.push("new")

config.user.name  // "John" (unchanged)
config.user.tags  // ["admin", "active"] (unchanged)
```

Clone only a portion (supports wildcards + `depth`, same as `$find`):

```typescript
const tagsCopy = config.$clone('user.tags')      // ["admin", "active"]
const firstNameCopy = config.$clone('*name')     // "John" (first match, cloned)
```

If the selector does not match anything, `$clone(query)` returns `undefined`.

The `$clone` method is optimized for performance using an iterative algorithm that avoids recursion overhead. Date objects are properly cloned as new `Date` instances.

### `$freeze()`

Make the parsed object fully immutable by recursively freezing it:

```typescript
const config = sg.parse(`
user
  name "John"
  tags ["admin", "active"]
`)

config.$freeze()

config.user.name = "Jane"     // Throws in strict mode, silently fails otherwise
config.user.tags.push("new")  // Throws in strict mode
```

The `$freeze` method recursively applies `Object.freeze()` to the entire object tree, including nested objects and arrays. Returns the locked object for chaining.

> **Note:** Method names use a `$` prefix (e.g., `$find`, `$findAll`, `$clone`, `$freeze`) because `$` is not a valid character in SlimGym keys. This guarantees that library methods will never conflict with your data keys.

## TypeScript

All methods support generics for type safety:

```typescript
interface Config {
  name: string
  port: number
}

const config = sg.parse<Config>(`name "App"\nport 8080`)
const config = sg.file<Config>('./config.sg')
const config = await sg.fileAsync<Config>('./config.sg')
const config = await sg.fetch<Config>('https://example.com/config.sg')
```

## Tree-Shaking

Import only what you need:

```typescript
import { parse, file, fileAsync, fetch } from 'slimgym/parse'
import { slimgify } from 'slimgym/slimgify'
```

**Exported Types:** `NodeObject`, `NodeValue`, `Primitive`, `ParseError`, `ParseOptions`, `FetchOptions`, `FetchUrlOptions`, `FindOptions`, `FindResult`

## Error Handling

```typescript
import { ParseError } from 'slimgym'

try {
  sg.file('./missing.sg')
} catch (error) {
  if (error instanceof ParseError) {
    console.error(error.message)  // "File not found: ..."
    console.error(error.lineNumber) // Line number (if parse error)
  }
}
```

## Security

SlimGym includes built-in protections when handling untrusted input:

### Prototype Pollution Protection

Keys like `__proto__`, `constructor`, and `prototype` are automatically blocked:

```typescript
sg.parse('__proto__ "evil"')  // Throws ParseError
```

### Path Traversal Prevention

Use `sandboxDir` to restrict file access:

```typescript
// Only allows access within /app/config
sg.file('../../../etc/passwd', {
  baseDir: '/app/config',
  sandboxDir: '/app/config'  // Blocks escape attempts
})
```

### SSRF Prevention

Use `allowedHosts` to restrict URL fetching:

```typescript
await sg.fetch('https://internal-api.local/config.sg', {
  allowedHosts: ['cdn.example.com']  // Blocks - not in allowlist
})
```

### DoS Protection

Limits prevent resource exhaustion:

```typescript
sg.parse(maliciousInput, {
  maxDepth: 50,        // Max nesting depth (default: 100)
  maxArraySize: 1000,  // Max array items (default: 10000)
  maxImportDepth: 5    // Max @import chain (default: 10)
})
```

Set any limit to `0` or `Infinity` to disable it.

## Use Cases

**AI prompt templates** - Store system prompts, few-shot examples, and long multi-line instructions with block strings (no escaping).

**Multi-environment config** - Compose a base config and override per environment using `@` imports.

**Test fixtures** - Keep readable test data and API mock responses; compose fixtures with forced arrays and imports.

**Game content** - Dialogue, quests, item databases—friendly for writers/designers to edit safely.

**i18n / localization** - Structured translations with block strings for long copy.

**CMS content** - Static pages with metadata + content in one human-editable file.

## Development

This project uses Bun for development:

```bash
bun install    # Install dependencies
bun run build  # Build the project
bun test       # Run tests
```

### Using Node.js

The published package is fully compatible with Node.js (v18+). Install with your preferred package manager:

```bash
npm install slimgym
# or
yarn add slimgym
# or
pnpm add slimgym
```

**No runtime differences** — the package uses standard Node.js APIs (`node:fs`, `node:path`) that work identically in both Bun and Node.js. All features, including `file()`, `fileAsync()`, `fetch()`, and `parse()`, behave the same regardless of runtime.

If you want to contribute or run the test suite locally with Node.js instead of Bun:

```bash
# Install dependencies (using npm/pnpm/yarn)
npm install

# Build (requires tsc from devDependencies)
npm run build

# Run tests (requires vitest from devDependencies)
npx vitest run
```

> **Note:** The lockfile (`bun.lockb`) is Bun-specific. When using npm/pnpm/yarn, a new lockfile will be generated for your package manager.

## License

MIT
