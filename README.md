# slimgym

An indentation-based configuration format that combines clean syntax with modern features like block strings, arrays, comments, type inference, and bidirectional conversion.

## Installation

```bash
pnpm add slimgym
# or
npm install slimgym
```

## Quick Start

```typescript
import sg from 'slimgym'

// Parse a string
const config = sg.parse(`
app
  name "MyApp"
  port 8080
  tags ["web", "api"]
`)

// Fetch from a file (sync or async)
const config = sg.fetch('./config.sg')
const config = await sg.fetchAsync('./config.sg')

// Fetch from a URL
const config = await sg.fetchUrl('https://example.com/config.sg')

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
- **File fetching** - Read files with `fetch()`, `fetchAsync()`, or `fetchUrl()`
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
- `maxDepth` - Maximum nesting depth (default: 100, set to 0 to disable)
- `maxArraySize` - Maximum array size (default: 10000, set to 0 to disable)
- `maxImportDepth` - Maximum `@` import chain depth (default: 10, set to 0 to disable)

### `fetch<T>(filePath: string, options?): T`

Read and parse a SlimGym file synchronously.

```typescript
const config = sg.fetch('./config.sg')
const config = sg.fetch('config.sg', { baseDir: '/app', sandboxDir: '/app' })
```

**Options:**
- `baseDir` - Base directory for relative paths (default: `process.cwd()`)
- `sandboxDir` - Restrict file access to this directory (prevents path traversal)
- `maxDepth`, `maxArraySize`, `maxImportDepth` - Same as `parse()`

### `fetchAsync<T>(filePath: string, options?): Promise<T>`

Read and parse a SlimGym file asynchronously.

```typescript
const config = await sg.fetchAsync('./config.sg')
const config = await sg.fetchAsync('config.sg', { baseDir: '/app', sandboxDir: '/app' })
```

**Options:** Same as `fetch()`

### `fetchUrl<T>(url: string, options?): Promise<T>`

Fetch and parse a SlimGym file from a URL using Node's native `fetch`.

```typescript
const config = await sg.fetchUrl('https://example.com/config.sg')
const config = await sg.fetchUrl('https://cdn.example.com/config.sg', {
  allowedHosts: ['cdn.example.com']
})
```

**Options:**
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

### `toJSON()`

Parsed objects include a `toJSON()` method that converts Date objects to ISO strings:

```typescript
const config = sg.parse(`date 2025-06-15T09:00:00Z`)
config.date          // Date object
config.toJSON().date // "2025-06-15T09:00:00.000Z"
```

## TypeScript

All methods support generics for type safety:

```typescript
interface Config {
  name: string
  port: number
}

const config = sg.parse<Config>(`name "App"\nport 8080`)
const config = sg.fetch<Config>('./config.sg')
const config = await sg.fetchAsync<Config>('./config.sg')
const config = await sg.fetchUrl<Config>('https://example.com/config.sg')
```

## Tree-Shaking

Import only what you need:

```typescript
import { parse, fetch, fetchAsync, fetchUrl } from 'slimgym/parse'
import { slimgify } from 'slimgym/slimgify'
```

**Exported Types:** `NodeObject`, `NodeValue`, `Primitive`, `ParseError`, `ParseOptions`, `FetchOptions`, `FetchUrlOptions`

## Error Handling

```typescript
import { ParseError } from 'slimgym'

try {
  sg.fetch('./missing.sg')
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
sg.fetch('../../../etc/passwd', {
  baseDir: '/app/config',
  sandboxDir: '/app/config'  // Blocks escape attempts
})
```

### SSRF Prevention

Use `allowedHosts` to restrict URL fetching:

```typescript
await sg.fetchUrl('https://internal-api.local/config.sg', {
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

**Configuration files** - App settings, environment configs, feature flags

**Content definition** - CMS content, templates, theming

**Data serialization** - Human-readable data storage and exchange

## Development

```bash
pnpm install    # Install dependencies
pnpm run build  # Build the project
pnpm test       # Run tests
```

## License

MIT
