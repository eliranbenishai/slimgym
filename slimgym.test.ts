import { describe, test, expect } from 'vitest'
import sg, { ParseError } from './index'

describe('parse', () => {
  describe('basic parsing', () => {
    test('parses simple key-value pairs', () => {
      const result = sg.parse('name "John"')
      expect(result).toEqual({ name: 'John' })
    })

    test('parses multiple key-value pairs', () => {
      const result = sg.parse(`
name "John"
age 30
active true
`)
      expect(result).toEqual({
        name: 'John',
        age: 30,
        active: true,
      })
    })

    test('parses nested objects', () => {
      interface NestedConfig {
        user: {
          name: string
          age: number
        }
      }
      const result = sg.parse<NestedConfig>(`
user
  name "John"
  age 30
`)
      expect(result).toEqual({
        user: {
          name: 'John',
          age: 30,
        },
      })
    })

    test('parses deeply nested objects', () => {
      interface DeepNestedConfig {
        a: {
          b: {
            c: {
              d: string
            }
          }
        }
      }
      const result = sg.parse<DeepNestedConfig>(`
a
  b
    c
      d "value"
`)
      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: 'value',
            },
          },
        },
      })
    })

    test('handles empty input', () => {
      const result = sg.parse('')
      expect(result).toEqual({})
    })

    test('skips blank lines', () => {
      const result = sg.parse(`
name "John"

age 30
`)
      expect(result).toEqual({
        name: 'John',
        age: 30,
      })
    })

    test('skips comments', () => {
      const result = sg.parse(`
# This is a comment
name "John"
# Another comment
age 30
`)
      expect(result).toEqual({
        name: 'John',
        age: 30,
      })
    })
  })

  describe('type inference', () => {
    test.each([
      ['integer', 42, 42],
      ['float', 3.14, 3.14],
      ['negative', -10, -10],
      ['scientific', 1e5, 100000],
    ])('parses number: %s', (key, input, expected) => {
      const result = sg.parse(`${key} ${input}`)
      expect(result[key]).toBe(expected)
    })

    test('parses booleans', () => {
      const result = sg.parse(`
active true
inactive false
`)
      expect(result).toEqual({
        active: true,
        inactive: false,
      })
    })

    test('parses null and undefined', () => {
      const result = sg.parse(`
value null
missing undefined
`)
      expect(result).toEqual({
        value: null,
        missing: undefined,
      })
    })

    test('parses dates with ISO format', () => {
      const result = sg.parse(`
date1 2025-11-19
date2 2025-11-19T10:30:00
date3 2025-11-19 10:30:00
`)
      expect(result.date1).toBeInstanceOf(Date)
      expect(result.date2).toBeInstanceOf(Date)
      expect(result.date3).toBeInstanceOf(Date)
    })


    test('parses quoted strings', () => {
      const result = sg.parse(`
single 'single quoted'
double "double quoted"
`)
      expect(result).toEqual({
        single: 'single quoted',
        double: 'double quoted',
      })
    })

    test('parses unquoted strings', () => {
      const result = sg.parse('key unquoted-value')
      expect(result).toEqual({ key: 'unquoted-value' })
    })

    test('handles string escape sequences', () => {
      const result = sg.parse(`
newline "line1\\nline2"
tab "col1\\tcol2"
quote "say \\"hello\\""
backslash "path\\\\to\\\\file"
`)
      expect(result).toEqual({
        newline: 'line1\nline2',
        tab: 'col1\tcol2',
        quote: 'say "hello"',
        backslash: 'path\\to\\file',
      })
    })
  })

  describe('block strings', () => {
    test('parses block strings', () => {
      const result = sg.parse(`
message """
  Hello
  World
"""
`)
      expect(result.message).toBe('Hello\nWorld')
    })

    test('preserves blank lines in block strings', () => {
      const result = sg.parse(`
text """
  Line 1

  Line 2
"""
`)
      expect(result.text).toBe('Line 1\n\nLine 2')
    })

    test('handles empty block strings', () => {
      const result = sg.parse(`
empty """
"""
`)
      expect(result.empty).toBe('')
    })

    test('handles block strings with indentation', () => {
      const result = sg.parse(`
code """
    function test() {
      return true
    }
"""
`)
      expect(result.code).toBe('function test() {\n  return true\n}')
    })
  })

  describe('arrays', () => {
    test('parses inline arrays', () => {
      interface ItemsConfig {
        items: string[]
      }
      const result = sg.parse<ItemsConfig>('items ["a", "b", "c"]')
      expect(result.items).toEqual(['a', 'b', 'c'])
    })

    test('parses inline arrays with mixed types', () => {
      interface MixedArrayConfig {
        mixed: Array<string | number | boolean | null>
      }
      const result = sg.parse<MixedArrayConfig>('mixed ["string", 123, true, null]')
      expect(result.mixed).toEqual(['string', 123, true, null])
    })

    test('parses multi-line arrays', () => {
      interface ItemsConfig {
        items: string[]
      }
      const result = sg.parse<ItemsConfig>(`
items [
  "a"
  "b"
  "c"
]
`)
      expect(result.items).toEqual(['a', 'b', 'c'])
    })

    test('parses multi-line arrays with trailing commas', () => {
      interface ItemsConfig {
        items: string[]
      }
      const result = sg.parse<ItemsConfig>(`
items [
  "a",
  "b",
  "c",
]
`)
      expect(result.items).toEqual(['a', 'b', 'c'])
    })

    test('parses empty arrays', () => {
      interface EmptyArrayConfig {
        empty: string[]
      }
      const result = sg.parse<EmptyArrayConfig>('empty []')
      expect(result.empty).toEqual([])
    })

    test('parses arrays with block strings', () => {
      interface MessagesConfig {
        messages: string[]
      }
      const result = sg.parse<MessagesConfig>(`
messages [
  "short"
  """
    This is a
    longer message
  """
  "another"
]
`)
      expect(result.messages).toEqual([
        'short',
        'This is a\nlonger message',
        'another',
      ])
    })

    test('parses nested arrays', () => {
      interface NestedArrayConfig {
        nested: number[][]
      }
      const result = sg.parse<NestedArrayConfig>('nested [[1, 2], [3, 4]]')
      expect(result.nested).toEqual([[1, 2], [3, 4]])
    })
  })

  describe('repeated keys', () => {
    test('converts repeated keys to arrays', () => {
      interface RepeatedKeysConfig {
        item: string[]
      }
      const result = sg.parse<RepeatedKeysConfig>(`
item "first"
item "second"
item "third"
`)
      expect(result.item).toEqual(['first', 'second', 'third'])
    })

    test('handles mixed single and repeated keys', () => {
      interface MixedKeysConfig {
        single: string
        item: string[]
      }
      const result = sg.parse<MixedKeysConfig>(`
single "value"
item "first"
item "second"
`)
      expect(result.single).toBe('value')
      expect(result.item).toEqual(['first', 'second'])
    })
  })

  describe('complex examples', () => {
    test('parses the example.sg file structure', () => {
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

      interface ExampleConfig {
        invoice: Invoice
        statuses: Array<string | number | Date | null>
        popsicles: Array<string | number>
      }

      const result = sg.parse<ExampleConfig>(`
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
    item
      sku "WIDGET-2"
      qty 5
      price 19.95
  notes null
statuses ["janky", 123, "jankier", 2025-11-19T22:01:34.567, null]
popsicles [
    "strawbeer"
    "lemon lime"
    """
        Those damned hellcats are ruining my hairdo!
        My whole "game" has gone "awry".
        I don't know what to do about it...
    """
    123
]
`)
      expect(result.invoice).toBeDefined()
      expect(result.invoice.id).toBe(1234)
      expect(result.invoice.customer.name).toBe('ACME Corp')
      expect(result.invoice.items.item).toHaveLength(2)
      expect(result.statuses).toHaveLength(5)
      expect(result.popsicles).toHaveLength(4)
    })
  })

  describe('error handling', () => {
    test.each([
      [null, 'null'],
      [123, 'number'],
      [{}, 'object'],
    ])('throws ParseError for non-string input: %s', (input, type) => {
      expect(() => {
        // @ts-expect-error - testing invalid input
        sg.parse(input)
      }).toThrow(ParseError)
    })

    test.each([
      ['key@name "value"'],
      ['key.name "value"'],
    ])('throws ParseError for invalid key format: %s', (input) => {
      expect(() => {
        sg.parse(input)
      }).toThrow(ParseError)
    })

    test('throws ParseError for unclosed arrays', () => {
      expect(() => {
        sg.parse(`
items [
  "a"
  "b"
`)
      }).toThrow(ParseError)

      expect(() => {
        sg.parse('items [')
      }).toThrow(ParseError)
    })

    test('throws ParseError for unmatched brackets in inline arrays', () => {
      expect(() => {
        sg.parse('items [a, b]]')
      }).toThrow(ParseError)

      expect(() => {
        sg.parse('items [[a, b]')
      }).toThrow(ParseError)
    })

    test('throws ParseError for unclosed strings in arrays', () => {
      expect(() => {
        sg.parse('items ["unclosed, "closed"]')
      }).toThrow(ParseError)
    })

    test('parses empty array with spaces', () => {
      interface EmptyItemsConfig {
        items: undefined[]
      }
      const result = sg.parse<EmptyItemsConfig>('items [ ]')
      expect(result.items).toEqual([])
    })

    test('includes line number in error message', () => {
      try {
        sg.parse(`
valid "line"
invalid@key "value"
`)
        expect.fail('Should have thrown ParseError')
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError)
        expect((error as ParseError).lineNumber).toBe(2)
        expect((error as ParseError).line).toContain('invalid@key')
      }
    })

    test('error message includes line content', () => {
      try {
        sg.parse('invalid@key "value"')
        expect.fail('Should have thrown ParseError')
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError)
        expect((error as ParseError).message).toContain('line 1')
        expect((error as ParseError).message).toContain('invalid@key')
      }
    })
  })

  describe('edge cases', () => {
    test('handles keys with underscores and hyphens', () => {
      const result = sg.parse(`
user_name "John"
user-id 123
`)
      expect(result).toEqual({
        user_name: 'John',
        'user-id': 123,
      })
    })

    test('handles very long block strings', () => {
      const longText = 'a'.repeat(1000)
      const result = sg.parse(`text """
${longText}
"""`)
      expect(result.text).toBe(longText)
    })

    test('handles arrays with many items', () => {
      const items = Array.from({ length: 100 }, (_, i) => i).join(', ')
      const result = sg.parse(`numbers [${items}]`)
      expect(result.numbers).toHaveLength(100)
    })

    test('handles deeply nested structures', () => {
      const depth = 20
      let input = 'root'
      for (let i = 0; i < depth; i++) {
        input += `\n${'  '.repeat(i + 1)}level${i}`
      }
      input += `\n${'  '.repeat(depth + 1)}value "deep"`

      const result = sg.parse(input)
      expect(result.root).toBeDefined()
    })

    test('handles special characters in strings', () => {
      const result = sg.parse(`
special "!@#$%^&*()_+-=[]{}|;:,.<>?"
`)
      expect(result.special).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?')
    })

    test('handles unicode characters', () => {
      const result = sg.parse(`
unicode "Hello 世界 🌍"
`)
      expect(result.unicode).toBe('Hello 世界 🌍')
    })

    test('handles dates with timezones', () => {
      const result = sg.parse(`
utc 2025-11-19T10:30:00Z
offset 2025-11-19T10:30:00+05:00
`)
      expect(result.utc).toBeInstanceOf(Date)
      expect(result.offset).toBeInstanceOf(Date)
    })
  })

  describe('toJSON', () => {
    test('converts Date objects to ISO strings', () => {
      const result = sg.parse(`
date 2025-11-19T10:30:00Z
`)
      expect(result.date).toBeInstanceOf(Date)
      const json = result.toJSON()
      expect(json.date).toBe('2025-11-19T10:30:00.000Z')
      expect(typeof json.date).toBe('string')
    })

    test('converts nested Date objects to ISO strings', () => {
      const result = sg.parse(`
event
  startDate 2025-06-15T09:00:00Z
  endDate 2025-06-17T18:00:00Z
`)
      expect(result.event.startDate).toBeInstanceOf(Date)
      const json = result.toJSON()
      expect(json.event.startDate).toBe('2025-06-15T09:00:00.000Z')
      expect(json.event.endDate).toBe('2025-06-17T18:00:00.000Z')
    })

    test('converts Date objects in arrays to ISO strings', () => {
      const result = sg.parse(`
dates [
  2025-11-19T10:30:00Z
  2025-12-25T00:00:00Z
]
`)
      expect(result.dates[0]).toBeInstanceOf(Date)
      const json = result.toJSON()
      expect(json.dates[0]).toBe('2025-11-19T10:30:00.000Z')
      expect(json.dates[1]).toBe('2025-12-25T00:00:00.000Z')
    })

    test('preserves other types unchanged', () => {
      const result = sg.parse(`
name "John"
age 30
active true
tags ["a", "b"]
`)
      const json = result.toJSON()
      expect(json.name).toBe('John')
      expect(json.age).toBe(30)
      expect(json.active).toBe(true)
      expect(json.tags).toEqual(['a', 'b'])
    })
  })
})

describe('slimgify', () => {
  describe('basic serialization', () => {
    test('serializes simple key-value pairs', () => {
      const obj = { name: 'John' }
      const result = sg.slimgify(obj)
      expect(result).toBe('name "John"')
    })

    test('serializes multiple key-value pairs', () => {
      const obj = {
        name: 'John',
        age: 30,
        active: true,
      }
      const result = sg.slimgify(obj)
      expect(result).toContain('name "John"')
      expect(result).toContain('age 30')
      expect(result).toContain('active true')
    })

    test('serializes nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          age: 30,
        },
      }
      const result = sg.slimgify(obj)
      expect(result).toContain('user')
      expect(result).toContain('  name "John"')
      expect(result).toContain('  age 30')
    })

    test('handles empty object', () => {
      const result = sg.slimgify({})
      expect(result).toBe('')
    })

    test('handles null and undefined', () => {
      expect(sg.slimgify(null)).toBe('')
      expect(sg.slimgify(undefined)).toBe('')
    })
  })

  describe('type serialization', () => {
    test('serializes booleans', () => {
      const obj = { active: true, inactive: false }
      const result = sg.slimgify(obj)
      expect(result).toContain('active true')
      expect(result).toContain('inactive false')
    })

    test('serializes numbers', () => {
      const obj = { integer: 42, float: 3.14, negative: -10 }
      const result = sg.slimgify(obj)
      expect(result).toContain('integer 42')
      expect(result).toContain('float 3.14')
      expect(result).toContain('negative -10')
    })

    test('serializes null and undefined values', () => {
      const obj = { value: null, missing: undefined }
      const result = sg.slimgify(obj)
      expect(result).toContain('value null')
      expect(result).toContain('missing undefined')
    })

    test('serializes Date objects', () => {
      const date = new Date('2025-11-19T10:30:00Z')
      const obj = { date }
      const result = sg.slimgify(obj)
      expect(result).toContain('date 2025-11-19T10:30:00.000Z')
    })

    test('serializes quoted strings', () => {
      const obj = { single: 'single quoted', double: 'double quoted', spaced: 'has spaces' }
      const result = sg.slimgify(obj)
      expect(result).toContain('single "single quoted"')
      expect(result).toContain('double "double quoted"')
      expect(result).toContain('spaced "has spaces"')
    })

    test('serializes unquoted strings when appropriate', () => {
      const obj = { key: 'unquoted-value' }
      const result = sg.slimgify(obj)
      // Strings are quoted for consistency with the format
      expect(result).toBe('key "unquoted-value"')
    })
  })

  describe('block strings', () => {
    test('serializes block strings for multi-line strings', () => {
      const obj = {
        message: 'Hello\nWorld',
      }
      const result = sg.slimgify(obj)
      expect(result).toContain('message """')
      expect(result).toContain('  Hello')
      expect(result).toContain('  World')
      expect(result).toContain('"""')
    })

    test('preserves blank lines in block strings', () => {
      const obj = {
        text: 'Line 1\n\nLine 2',
      }
      const result = sg.slimgify(obj)
      const parsed = sg.parse(result)
      expect(parsed.text).toBe('Line 1\n\nLine 2')
    })
  })

  describe('arrays', () => {
    test('serializes inline arrays', () => {
      const obj = { items: ['a', 'b', 'c'] }
      const result = sg.slimgify(obj)
      expect(result).toContain('items ["a", "b", "c"]')
    })

    test('serializes multi-line arrays for long arrays', () => {
      const obj = { items: ['a', 'b', 'c', 'd', 'e'] }
      const result = sg.slimgify(obj)
      expect(result).toContain('items [')
      expect(result).toContain('  "a"')
      expect(result).toContain(']')
    })

    test('serializes empty arrays', () => {
      const obj = { empty: [] }
      const result = sg.slimgify(obj)
      expect(result).toContain('empty []')
    })

    test('serializes arrays with mixed types', () => {
      const obj = { mixed: ['string', 123, true, null] }
      const result = sg.slimgify(obj)
      const parsed = sg.parse(result)
      expect(parsed.mixed).toEqual(['string', 123, true, null])
    })

    test('serializes arrays with block strings', () => {
      const obj = {
        messages: [
          'short',
          'This is a\nlonger message',
          'another',
        ],
      }
      const result = sg.slimgify(obj)
      const parsed = sg.parse(result)
      expect(parsed.messages).toEqual([
        'short',
        'This is a\nlonger message',
        'another',
      ])
    })
  })

  test('serializes array of objects as repeated keys', () => {
    const obj = {
      users: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    }
    const result = sg.slimgify(obj)
    expect(result).toContain('users\n  name "Alice"')
    expect(result).toContain('users\n  name "Bob"')
    expect(result).not.toContain('users [')
  })

  describe('round-trip tests', () => {
    test('parse and slimgify produce equivalent results', () => {
      const input = `
name "John"
age 30
active true
`
      const parsed = sg.parse(input)
      const serialized = sg.slimgify(parsed)
      const reparsed = sg.parse(serialized)
      expect(reparsed).toEqual(parsed)
    })

    test('handles nested objects round-trip', () => {
      const input = `
user
  name "John"
  age 30
`
      const parsed = sg.parse(input)
      const serialized = sg.slimgify(parsed)
      const reparsed = sg.parse(serialized)
      expect(reparsed).toEqual(parsed)
    })

    test('handles arrays round-trip', () => {
      const input = 'items ["a", "b", "c"]'
      const parsed = sg.parse(input)
      const serialized = sg.slimgify(parsed)
      const reparsed = sg.parse(serialized)
      expect(reparsed.items).toEqual(['a', 'b', 'c'])
    })

    test('handles block strings round-trip', () => {
      const input = `
message """
  Hello
  World
"""
`
      const parsed = sg.parse(input)
      const serialized = sg.slimgify(parsed)
      const reparsed = sg.parse(serialized)
      expect(reparsed.message).toBe('Hello\nWorld')
    })

    test('handles complex example round-trip', () => {
      const input = `
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
statuses ["janky", 123, "jankier", 2025-11-19T22:01:34.567, null]
`
      const parsed = sg.parse(input)
      const serialized = sg.slimgify(parsed)
      const reparsed = sg.parse(serialized)
      expect(reparsed.invoice.id).toBe(1234)
      expect(reparsed.invoice.customer.name).toBe('ACME Corp')
      expect(reparsed.statuses).toHaveLength(5)
    })
  })

  describe('forced array syntax', () => {
    test('parses forced array with [] prefix', () => {
      interface ForcedArrayConfig {
        items: string[]
      }
      const result = sg.parse<ForcedArrayConfig>('[]items "item1"')
      expect(result.items).toEqual(['item1'])
    })

    test('parses forced array with multiple items using [] prefix', () => {
      interface ForcedArrayConfig {
        items: string[]
      }
      const result = sg.parse<ForcedArrayConfig>(`
[]items "item1"
items "item2"
`)
      expect(result.items).toEqual(['item1', 'item2'])
    })
  })

  describe('imports', () => {
    test('imports file content', () => {
      const result = sg.parse('imported @"./history-items.sg"')
      expect(result.imported).toBeDefined()
      expect(result.imported.description).toBe("History items")
    })

    test('throws ParseError when imported file is missing', () => {
      expect(() => {
        sg.parse('imported @"./missing.sg"')
      }).toThrow(ParseError)

      try {
        sg.parse('imported @"./missing.sg"')
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError)
        expect((error as ParseError).message).toContain('Failed to import file')
        expect((error as ParseError).message).toContain('missing.sg')
      }
    })

    test('throws ParseError when imported file has invalid syntax', () => {
      // Create a temporary file with invalid syntax
      const fs = require('node:fs')
      const path = require('node:path')
      const tempFile = path.join(__dirname, 'invalid.sg')
      fs.writeFileSync(tempFile, 'invalid@key "value"')

      try {
        expect(() => {
          sg.parse(`imported @"${tempFile}"`)
        }).toThrow(ParseError)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    test('unwraps single-key array with @@ syntax', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const tempFile = path.join(__dirname, 'items.sg')
      fs.writeFileSync(tempFile, 'list ["a", "b"]')

      try {
        const result = sg.parse(`items @@"${tempFile}"`)
        expect(result.items).toEqual(['a', 'b'])
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    test('throws error when @@ used on file with multiple keys', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const tempFile = path.join(__dirname, 'multi.sg')
      fs.writeFileSync(tempFile, `
key1 ["a"]
key2 ["b"]
`)

      try {
        expect(() => {
          sg.parse(`items @@"${tempFile}"`)
        }).toThrow(ParseError)

        try {
          sg.parse(`items @@"${tempFile}"`)
        } catch (e) {
          expect((e as ParseError).message).toContain('exactly one root key')
        }
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    test('throws error when @@ used on file with non-array value', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const tempFile = path.join(__dirname, 'nonarray.sg')
      fs.writeFileSync(tempFile, 'key "value"')

      try {
        expect(() => {
          sg.parse(`items @@"${tempFile}"`)
        }).toThrow(ParseError)

        try {
          sg.parse(`items @@"${tempFile}"`)
        } catch (e) {
          expect((e as ParseError).message).toContain('must be an array')
        }
      } finally {
        fs.unlinkSync(tempFile)
      }
    })
  })
})
