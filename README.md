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

// Or fetch from a file
const config = sg.fetch('./config.sg')

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
- **File fetching** - Read files directly with `fetch()`
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

### `fetch<T>(filePath: string, options?): T`

Read and parse a SlimGym file. Supports relative and absolute paths.

```typescript
// Relative to cwd
const config = sg.fetch('./config.sg')

// With custom base directory
const config = sg.fetch('config.sg', { baseDir: '/app' })
```

**Options:**
- `baseDir` - Base directory for relative paths (default: `process.cwd()`)

**Throws** `ParseError` if file not found or invalid syntax.

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
```

## Tree-Shaking

Import only what you need:

```typescript
import { parse, fetch } from 'slimgym/parse'
import { slimgify } from 'slimgym/slimgify'
```

**Exported Types:** `NodeObject`, `NodeValue`, `Primitive`, `ParseError`, `FetchOptions`

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
