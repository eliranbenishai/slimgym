# slimgym

JSON is too verbose and lacks modern features. YAML is too restrictive. SlimGym isn't.

SlimGym is an indentation-based configuration format parser that combines the simplicity of indentation-based syntax with modern features like block strings, arrays, and type inference.

## Installation

```bash
pnpm add slimgym
```

Or with npm:
```bash
npm install slimgym
```

## Development

This project uses [pnpm](https://pnpm.io/) as its package manager.

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build
```

## Usage

```typescript
import sg from 'slimgym'

interface InvoiceItem {
  sku: string
  qty: number
  price: number
}

interface Customer {
  name: string
  contact: string
}

interface Invoice {
  id: number
  date: Date
  customer: Customer
  items: {
    item: InvoiceItem[]
  }
}

interface Config {
  invoice: Invoice
}

const config = `
invoice
  id 1234
  date 2025-11-19
  customer
    name "ACME Corp"
    contact """
      Jane Doe
      +1 555 1234
    """
  items
    item
      sku "WIDGET-1"
      qty 10
      price 9.99
`

const parsed = sg.parse<Config>(config)
console.log(parsed)
```

## Features

- **Indentation-based syntax** - Clean and readable
- **Block strings** - Multi-line strings with `"""`
- **Type inference** - Automatically detects numbers, booleans, dates, and null
- **Arrays** - Support for arrays with mixed types
- **Comments** - Lines starting with `#` are ignored
- **Repeated keys** - Automatically converted to arrays
- **High performance** - Optimized parser with excellent performance characteristics

## Performance

SlimGym is designed for speed. The parser is optimized for real-world use cases and handles large files efficiently:

### Benchmark Results

All benchmarks run on a modern development machine. Times are in microseconds (μs).

| Test Case | Size | Parse Time |
|-----------|------|------------|
| Simple key-value pairs | 100 items | ~740 μs |
| Deeply nested objects | 10 levels | ~50 μs |
| Large inline arrays | 1,000 items | ~660 μs |
| Multi-line arrays | 500 items | ~400 μs |
| Large block strings | 10KB | ~20 μs |
| Multiple block strings | 100 strings | ~175 μs |
| Complex nested structure | 50 objects | ~360 μs |
| Repeated keys | 200 repetitions | ~470 μs |
| Mixed types | 500 values | ~1,270 μs |
| Very large input | 50KB, 5,000 lines | ~6,000 μs |
| Block strings with quotes | 50 strings | ~80 μs |
| Nested arrays | 5 levels deep | ~44 μs |
| Comments everywhere | 1,000 lines | ~840 μs |
| **giant.sg file** | **100,000 lines** | **~98ms** |

### Performance Highlights

- **100,000 lines parsed in under 100ms** - Handles enterprise-scale configuration files with ease
- **Sub-millisecond parsing** for typical use cases (hundreds to thousands of lines)
- **Efficient memory usage** - Processes files without excessive memory allocation
- **Optimized for common patterns** - Fast parsing of nested structures, arrays, and block strings

The parser uses optimized algorithms and avoids regex where possible for maximum performance.

## Examples

### Basic Configuration

```typescript
import sg from 'slimgym'

const config = sg.parse(`
name "My Application"
version 1.0.0
enabled true
port 8080
`)
// Result: { name: "My Application", version: 1.0.0, enabled: true, port: 8080 }
```

### Comments

Comments start with `#` and can appear anywhere:

```typescript
import sg from 'slimgym'

const config = sg.parse(`
# Application configuration
app
  name "MyApp"
  # Server settings
  server
    host "localhost"
    port 8080  # HTTP port
  # Feature flags
  features
    beta true
    # legacy false  # Commented out
`)
```

### Arrays

#### Inline Arrays

```typescript
import sg from 'slimgym'

const config = sg.parse(`
tags ["frontend", "react", "typescript"]
numbers [1, 2, 3, 4, 5]
mixed [true, "string", 42, null]
`)
// Result: {
//   tags: ["frontend", "react", "typescript"],
//   numbers: [1, 2, 3, 4, 5],
//   mixed: [true, "string", 42, null]
// }
```

#### Multi-line Arrays

```typescript
import sg from 'slimgym'

const config = sg.parse(`
dependencies [
  "react"
  "react-dom"
  "typescript"
]
# Empty array
empty []
`)
```

#### Arrays with Block Strings

```typescript
import sg from 'slimgym'

const config = sg.parse(`
messages [
  "Short message"
  """
    This is a longer
    multi-line message
    with multiple paragraphs.
  """
  "Another message"
]
`)
```

### Block Strings

Block strings preserve formatting and whitespace:

```typescript
import sg from 'slimgym'

const config = sg.parse(`
description """
  This is a multi-line
  block string that preserves
  line breaks and indentation.
  
  It can contain "quotes" and 'apostrophes'
  without escaping.
"""
code """
function hello() {
  console.log("Hello, World!")
}
"""
`)
```

### Complex Nested Structures

```typescript
import sg from 'slimgym'

interface ComplexConfig {
  app: {
    name: string
    version: string
    database: {
      host: string
      port: number
      credentials: {
        username: string
        password: string
      }
    }
    endpoints: string[]
    features: {
      featureA: boolean
      featureB: boolean
      featureC: null
    }
  }
}

const config = sg.parse<ComplexConfig>(`
# Application configuration
app
  name "MyApp"
  version 2.1.0
  
  # Database configuration
  database
    host "localhost"
    port 5432
    credentials
      username "admin"
      password "secret"
    
  # API endpoints
  endpoints [
    "/api/v1/users"
    "/api/v1/posts"
    "/api/v1/comments"
  ]
  
  # Feature flags
  features
    featureA true
    featureB false
    featureC null  # Not yet decided
`)
```

### Mixed Types and Dates

```typescript
import sg from 'slimgym'

const config = sg.parse(`
# Event configuration
event
  name "Conference 2025"
  startDate 2025-06-15T09:00:00Z
  endDate 2025-06-17T18:00:00Z
  attendees 150
  active true
  
  # Tags and metadata
  tags ["conference", "tech", "2025"]
  status "upcoming"
`)
```

### Repeated Keys (Auto-Arrays)

When the same key appears multiple times, it's automatically converted to an array:

```typescript
import sg from 'slimgym'

const config = sg.parse(`
# Multiple items with the same key
item
  name "First Item"
  price 10.99
item
  name "Second Item"
  price 19.99
item
  name "Third Item"
  price 29.99
`)
// Result: {
//   item: [
//     { name: "First Item", price: 10.99 },
//     { name: "Second Item", price: 19.99 },
//     { name: "Third Item", price: 29.99 }
//   ]
// }
```

### Complete Example

```typescript
import sg from 'slimgym'

interface InvoiceItem {
  sku: string
  qty: number
  price: number
}

interface Customer {
  name: string
  contact: string
}

interface Invoice {
  id: number
  date: Date
  customer: Customer
  items: {
    item: InvoiceItem[]
  }
  notes: null
}

interface InvoiceConfig {
  invoice: Invoice
  statuses: Array<string | number | Date | null>
  tags: string[]
}

const invoice = sg.parse<InvoiceConfig>(`
# Invoice Configuration
invoice
  id 1234
  date 2025-11-19
  customer
    name "ACME Corp"
    contact """
      Jane Doe
      +1 555 1234
      jane@acme.com
    """
  
  # Line items
  items
    item
      sku "WIDGET-1"
      qty 10
      price 9.99
    item
      sku "WIDGET-2"
      qty 5
      price 19.95
  
  notes null
  
# Additional metadata
statuses ["pending", "processing", "completed"]
tags ["urgent", "b2b"]
`)

console.log(invoice.invoice.customer.name) // "ACME Corp"
console.log(invoice.invoice.items.item.length) // 2
console.log(invoice.statuses) // ["pending", "processing", "completed"]
```

## API

### `sg.parse<T = any>(input: string): T`

Parses a SlimGym configuration string and returns a JavaScript object with a `toJSON()` method. Supports TypeScript generics for type safety.

**Parameters:**
- `input` (string): The SlimGym configuration string to parse

**Returns:**
- `T`: A JavaScript object representing the parsed configuration (defaults to `any`). The returned object has a `toJSON()` method that converts Date objects to ISO strings.

**Example:**

```typescript
import sg from 'slimgym'

// Basic usage
const result = sg.parse(`
  name "John"
  age 30
  active true
`)
// Result: { name: "John", age: 30, active: true }

// With TypeScript generics for type safety
interface UserConfig {
  name: string
  age: number
  active: boolean
}

const typedResult = sg.parse<UserConfig>(`
  name "John"
  age 30
  active true
`)
// TypeScript now knows the structure!
console.log(typedResult.name) // Type-safe access

// Converting to JSON (Date objects become ISO strings)
const config = sg.parse(`
  event "Conference"
  date 2025-06-15T09:00:00Z
`)
console.log(config.date) // Date object
const json = config.toJSON()
console.log(json.date) // "2025-06-15T09:00:00.000Z" (string)
```

**Exported Types:**

- `NodeObject`: The base object type returned by the parser
- `NodeValue`: Union type of all possible values (primitives, objects, arrays)
- `Primitive`: Union type of primitive values (string, number, boolean, null, undefined, Date)
- `ParseError`: Error class thrown for parsing errors

## License

GPL-3.0
