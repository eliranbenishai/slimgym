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

const parsed = sg.parse(config)
console.log(parsed)
```

## Features

- **Indentation-based syntax** - Clean and readable
- **Block strings** - Multi-line strings with `"""`
- **Type inference** - Automatically detects numbers, booleans, dates, and null
- **Arrays** - Support for arrays with mixed types
- **Comments** - Lines starting with `#` are ignored
- **Repeated keys** - Automatically converted to arrays

## API

### `sg.parse<T extends NodeObject = NodeObject>(input: string): T`

Parses a SlimGym configuration string and returns a JavaScript object. Supports TypeScript generics for type safety.

**Parameters:**
- `input` (string): The SlimGym configuration string to parse

**Returns:**
- `T`: A JavaScript object representing the parsed configuration (defaults to `NodeObject`)

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
```

**Exported Types:**

- `NodeObject`: The base object type returned by the parser
- `NodeValue`: Union type of all possible values (primitives, objects, arrays)
- `Primitive`: Union type of primitive values (string, number, boolean, null, undefined, Date)
- `ParseError`: Error class thrown for parsing errors

## License

GPL-3.0
