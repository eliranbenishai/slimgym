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

  describe('$clone', () => {
    test('creates a deep copy of simple objects', () => {
      const result = sg.parse(`
name "John"
age 30
active true
`)
      const cloned = result.$clone()
      expect(cloned).toEqual({ name: 'John', age: 30, active: true })
      expect(cloned).not.toBe(result)
    })

    test('creates a deep copy of nested objects', () => {
      const result = sg.parse(`
user
  name "John"
  address
    city "NYC"
    zip 10001
`)
      const cloned = result.$clone()
      expect(cloned).toEqual({
        user: {
          name: 'John',
          address: { city: 'NYC', zip: 10001 },
        },
      })
      // Verify deep independence
      expect(cloned.user).not.toBe(result.user)
      expect(cloned.user.address).not.toBe(result.user.address)
    })

    test('creates a deep copy of arrays', () => {
      const result = sg.parse(`
items ["a", "b", "c"]
numbers [1, 2, 3]
`)
      const cloned = result.$clone()
      expect(cloned).toEqual({ items: ['a', 'b', 'c'], numbers: [1, 2, 3] })
      expect(cloned.items).not.toBe(result.items)
      expect(cloned.numbers).not.toBe(result.numbers)
    })

    test('creates a deep copy of nested arrays', () => {
      const result = sg.parse(`
matrix [[1, 2], [3, 4]]
`)
      const cloned = result.$clone()
      expect(cloned.matrix).toEqual([[1, 2], [3, 4]])
      expect(cloned.matrix).not.toBe(result.matrix)
      expect(cloned.matrix[0]).not.toBe(result.matrix[0])
      expect(cloned.matrix[1]).not.toBe(result.matrix[1])
    })

    test('clones Date objects correctly', () => {
      const result = sg.parse(`
date 2025-11-19T10:30:00Z
`)
      const cloned = result.$clone()
      expect(cloned.date).toBeInstanceOf(Date)
      expect(cloned.date.getTime()).toBe(result.date.getTime())
      expect(cloned.date).not.toBe(result.date)
    })

    test('clones nested Date objects', () => {
      const result = sg.parse(`
event
  start 2025-06-15T09:00:00Z
  end 2025-06-17T18:00:00Z
`)
      const cloned = result.$clone()
      expect(cloned.event.start).toBeInstanceOf(Date)
      expect(cloned.event.end).toBeInstanceOf(Date)
      expect(cloned.event.start).not.toBe(result.event.start)
      expect(cloned.event.end).not.toBe(result.event.end)
    })

    test('clones Date objects in arrays', () => {
      const result = sg.parse(`
dates [2025-11-19T10:30:00Z, 2025-12-25T00:00:00Z]
`)
      const cloned = result.$clone()
      expect(cloned.dates[0]).toBeInstanceOf(Date)
      expect(cloned.dates[1]).toBeInstanceOf(Date)
      expect(cloned.dates[0]).not.toBe(result.dates[0])
      expect(cloned.dates[1]).not.toBe(result.dates[1])
    })

    test('handles null and undefined values', () => {
      const result = sg.parse(`
nullVal null
undefVal undefined
`)
      const cloned = result.$clone()
      expect(cloned.nullVal).toBe(null)
      expect(cloned.undefVal).toBe(undefined)
    })

    test('modifications to clone do not affect original', () => {
      const result = sg.parse(`
user
  name "John"
  tags ["a", "b"]
`)
      const cloned = result.$clone()

      // Modify the clone
      cloned.user.name = 'Jane'
      cloned.user.tags.push('c')

      // Original should be unchanged
      expect(result.user.name).toBe('John')
      expect(result.user.tags).toEqual(['a', 'b'])
    })

    test('modifications to original do not affect clone', () => {
      const result = sg.parse(`
user
  name "John"
  tags ["a", "b"]
`)
      const cloned = result.$clone()

      // Modify the original
      result.user.name = 'Jane'
      result.user.tags.push('c')

      // Clone should be unchanged
      expect(cloned.user.name).toBe('John')
      expect(cloned.user.tags).toEqual(['a', 'b'])
    })

    test('handles complex nested structures', () => {
      const result = sg.parse(`
app
  name "MyApp"
  settings
    theme "dark"
    notifications
      email true
      sms false
  users [
    "alice"
    "bob"
  ]
`)
      const cloned = result.$clone()
      expect(cloned).toEqual({
        app: {
          name: 'MyApp',
          settings: {
            theme: 'dark',
            notifications: { email: true, sms: false },
          },
          users: ['alice', 'bob'],
        },
      })
      // Verify deep independence
      expect(cloned.app).not.toBe(result.app)
      expect(cloned.app.settings).not.toBe(result.app.settings)
      expect(cloned.app.settings.notifications).not.toBe(result.app.settings.notifications)
      expect(cloned.app.users).not.toBe(result.app.users)
    })

    test('$clone method is non-enumerable', () => {
      const result = sg.parse(`name "John"`)
      expect(Object.keys(result)).toEqual(['name'])
      expect('$clone' in result).toBe(true)
    })
  })

  describe('$find', () => {
    test('finds exact key at root level', () => {
      const result = sg.parse(`
name "John"
age 30
`)
      expect(result.$find('name')).toBe('John')
      expect(result.$find('age')).toBe(30)
    })

    test('finds exact nested path', () => {
      const result = sg.parse(`
user
  name "John"
  address
    city "NYC"
`)
      expect(result.$find('user.name')).toBe('John')
      expect(result.$find('user.address.city')).toBe('NYC')
    })

    test('finds key ending with pattern using *suffix', () => {
      const result = sg.parse(`
firstName "John"
lastName "Doe"
`)
      expect(result.$find('*Name')).toBe('John')
    })

    test('finds key starting with pattern using prefix*', () => {
      const result = sg.parse(`
userName "johndoe"
userEmail "john@example.com"
`)
      expect(result.$find('user*')).toBe('johndoe')
    })

    test('finds key containing pattern using *infix*', () => {
      const result = sg.parse(`
myUserName "johndoe"
otherValue "test"
`)
      expect(result.$find('*User*')).toBe('johndoe')
    })

    test('finds wildcard key at any depth', () => {
      const result = sg.parse(`
user
  details
    firstName "John"
`)
      expect(result.$find('*Name')).toBe('John')
    })

    test('finds wildcard after exact path', () => {
      const result = sg.parse(`
user
  personalInfo
    firstName "John"
    lastName "Doe"
  workInfo
    companyName "ACME"
`)
      expect(result.$find('user.personalInfo.*Name')).toBe('John')
      expect(result.$find('user.workInfo.*Name')).toBe('ACME')
    })

    test('returns undefined for non-existent path', () => {
      const result = sg.parse(`name "John"`)
      expect(result.$find('nonexistent')).toBeUndefined()
      expect(result.$find('user.name')).toBeUndefined()
    })

    test('returns undefined for non-matching wildcard', () => {
      const result = sg.parse(`
firstName "John"
lastName "Doe"
`)
      expect(result.$find('*Email')).toBeUndefined()
    })

    test('respects depth option', () => {
      const result = sg.parse(`
level1
  level2
    level3
      deepValue "found"
`)
      expect(result.$find('*Value', { depth: 2 })).toBeUndefined()
      expect(result.$find('*Value', { depth: 4 })).toBe('found')
      expect(result.$find('*Value')).toBe('found') // default Infinity
    })

    test('searches inside arrays', () => {
      const result = sg.parse(`
users [
  "alice"
  "bob"
]
items
  item
    name "First"
  item
    name "Second"
`)
      // Array of primitives returns undefined (no keys to match)
      expect(result.$find('users.*')).toBeUndefined()
      // Array of objects can be searched
      expect(result.$find('items.item.name')).toBe('First')
    })

    test('finds first match with wildcard', () => {
      const result = sg.parse(`
user1
  firstName "Alice"
user2
  firstName "Bob"
`)
      // Should return first match
      expect(result.$find('*Name')).toBe('Alice')
    })

    test('wildcard matches any single key with *', () => {
      const result = sg.parse(`
config
  database
    host "localhost"
`)
      expect(result.$find('config.*.host')).toBe('localhost')
    })

    test('$find method is non-enumerable', () => {
      const result = sg.parse(`name "John"`)
      expect(Object.keys(result)).toEqual(['name'])
      expect('$find' in result).toBe(true)
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

describe('fetch', () => {
  describe('basic file fetching', () => {
    test('fetches and parses a file with absolute path', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      const tempFile = path.join(os.tmpdir(), `test-fetch-${Date.now()}.sg`)
      fs.writeFileSync(tempFile, `
name "John"
age 30
active true
`)
      try {
        const result = sg.fetch(tempFile)
        expect(result).toEqual({
          name: 'John',
          age: 30,
          active: true,
        })
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    test('fetches and parses a file with relative path using baseDir', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      const tempDir = path.join(os.tmpdir(), `test-fetch-dir-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      const tempFile = path.join(tempDir, 'config.sg')
      fs.writeFileSync(tempFile, `
database
  host "localhost"
  port 5432
`)
      try {
        const result = sg.fetch('config.sg', { baseDir: tempDir })
        expect(result).toEqual({
          database: {
            host: 'localhost',
            port: 5432,
          },
        })
      } finally {
        fs.unlinkSync(tempFile)
        fs.rmdirSync(tempDir)
      }
    })

    test('fetches nested files with proper relative import resolution', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      const tempDir = path.join(os.tmpdir(), `test-fetch-nested-${Date.now()}`)
      const subDir = path.join(tempDir, 'configs')
      fs.mkdirSync(subDir, { recursive: true })

      const mainFile = path.join(tempDir, 'main.sg')
      const includeFile = path.join(subDir, 'included.sg')

      fs.writeFileSync(includeFile, `
setting "from included"
value 42
`)
      fs.writeFileSync(mainFile, `
app
  name "MyApp"
  config @"configs/included.sg"
`)
      try {
        const result = sg.fetch(mainFile)
        expect(result).toEqual({
          app: {
            name: 'MyApp',
            config: {
              setting: 'from included',
              value: 42,
            },
          },
        })
      } finally {
        fs.unlinkSync(mainFile)
        fs.unlinkSync(includeFile)
        fs.rmdirSync(subDir)
        fs.rmdirSync(tempDir)
      }
    })

    test('supports generic type parameter', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      interface AppConfig {
        name: string
        version: number
      }
      const tempFile = path.join(os.tmpdir(), `test-fetch-typed-${Date.now()}.sg`)
      fs.writeFileSync(tempFile, `
name "MyApp"
version 1
`)
      try {
        const result = sg.fetch<AppConfig>(tempFile)
        expect(result.name).toBe('MyApp')
        expect(result.version).toBe(1)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })
  })

  describe('error handling', () => {
    test('throws ParseError for non-existent file', () => {
      expect(() => {
        sg.fetch('/nonexistent/path/file.sg')
      }).toThrow(ParseError)

      try {
        sg.fetch('/nonexistent/path/file.sg')
      } catch (e) {
        expect((e as ParseError).message).toContain('File not found')
      }
    })

    test('throws ParseError for empty file path', () => {
      expect(() => {
        sg.fetch('')
      }).toThrow(ParseError)

      try {
        sg.fetch('')
      } catch (e) {
        expect((e as ParseError).message).toContain('non-empty string')
      }
    })

    test('throws ParseError for whitespace-only file path', () => {
      expect(() => {
        sg.fetch('   ')
      }).toThrow(ParseError)

      try {
        sg.fetch('   ')
      } catch (e) {
        expect((e as ParseError).message).toContain('non-empty string')
      }
    })

    test('throws ParseError for invalid input type', () => {
      expect(() => {
        // @ts-expect-error Testing invalid input
        sg.fetch(123)
      }).toThrow(ParseError)
    })

    test('propagates parse errors from file content', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      const tempFile = path.join(os.tmpdir(), `test-fetch-invalid-${Date.now()}.sg`)
      fs.writeFileSync(tempFile, `
invalid!key "value"
`)
      try {
        expect(() => {
          sg.fetch(tempFile)
        }).toThrow(ParseError)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    test('throws ParseError when path is a directory', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')
      const tempDir = path.join(os.tmpdir(), `test-fetch-isdir-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      try {
        expect(() => {
          sg.fetch(tempDir)
        }).toThrow(ParseError)
      } finally {
        fs.rmdirSync(tempDir)
      }
    })
  })
})

describe('fetchAsync', () => {
  test('asynchronously fetches and parses a file', async () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    const tempFile = path.join(os.tmpdir(), `test-fetch-async-${Date.now()}.sg`)
    fs.writeFileSync(tempFile, `
name "AsyncTest"
value 42
`)
    try {
      const result = await sg.fetchAsync(tempFile)
      expect(result).toEqual({
        name: 'AsyncTest',
        value: 42,
      })
    } finally {
      fs.unlinkSync(tempFile)
    }
  })

  test('fetches with relative path and baseDir', async () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    const tempDir = path.join(os.tmpdir(), `test-fetch-async-dir-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })
    const tempFile = path.join(tempDir, 'async-config.sg')
    fs.writeFileSync(tempFile, `
async true
port 3000
`)
    try {
      const result = await sg.fetchAsync('async-config.sg', { baseDir: tempDir })
      expect(result).toEqual({
        async: true,
        port: 3000,
      })
    } finally {
      fs.unlinkSync(tempFile)
      fs.rmdirSync(tempDir)
    }
  })

  test('resolves nested imports correctly', async () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    const tempDir = path.join(os.tmpdir(), `test-fetch-async-nested-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    const mainFile = path.join(tempDir, 'main.sg')
    const includeFile = path.join(tempDir, 'included.sg')

    fs.writeFileSync(includeFile, `nested "value"`)
    fs.writeFileSync(mainFile, `
root "main"
imported @"included.sg"
`)
    try {
      const result = await sg.fetchAsync(mainFile)
      expect(result).toEqual({
        root: 'main',
        imported: { nested: 'value' },
      })
    } finally {
      fs.unlinkSync(mainFile)
      fs.unlinkSync(includeFile)
      fs.rmdirSync(tempDir)
    }
  })

  test('throws ParseError for non-existent file', async () => {
    await expect(sg.fetchAsync('/nonexistent/path/file.sg')).rejects.toThrow(ParseError)
  })

  test('throws ParseError for empty file path', async () => {
    await expect(sg.fetchAsync('')).rejects.toThrow(ParseError)
  })

  test('supports TypeScript generics', async () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    interface TypedConfig {
      name: string
      count: number
    }
    const tempFile = path.join(os.tmpdir(), `test-fetch-async-typed-${Date.now()}.sg`)
    fs.writeFileSync(tempFile, `
name "TypedAsync"
count 100
`)
    try {
      const result = await sg.fetchAsync<TypedConfig>(tempFile)
      expect(result.name).toBe('TypedAsync')
      expect(result.count).toBe(100)
    } finally {
      fs.unlinkSync(tempFile)
    }
  })
})

describe('fetchUrl', () => {
  test('throws ParseError for empty URL', async () => {
    await expect(sg.fetchUrl('')).rejects.toThrow(ParseError)
  })

  test('throws ParseError for whitespace-only URL', async () => {
    await expect(sg.fetchUrl('   ')).rejects.toThrow(ParseError)
  })

  test('throws ParseError for invalid input type', async () => {
    // @ts-expect-error Testing invalid input
    await expect(sg.fetchUrl(123)).rejects.toThrow(ParseError)
  })

  test('throws ParseError for failed fetch', async () => {
    // This URL should fail to fetch
    await expect(sg.fetchUrl('http://localhost:99999/nonexistent.sg')).rejects.toThrow(ParseError)
  })

  test('throws ParseError when host is not in allowedHosts', async () => {
    await expect(
      sg.fetchUrl('https://malicious.com/config.sg', { allowedHosts: ['example.com'] })
    ).rejects.toThrow(ParseError)

    try {
      await sg.fetchUrl('https://malicious.com/config.sg', { allowedHosts: ['example.com'] })
    } catch (e) {
      expect((e as ParseError).message).toContain('not in the allowed hosts list')
    }
  })
})

describe('security', () => {
  describe('prototype pollution prevention', () => {
    test('rejects __proto__ key', () => {
      expect(() => {
        sg.parse('__proto__ "polluted"')
      }).toThrow(ParseError)

      try {
        sg.parse('__proto__ "polluted"')
      } catch (e) {
        expect((e as ParseError).message).toContain('Forbidden key')
        expect((e as ParseError).message).toContain('prototype pollution')
      }
    })

    test('rejects constructor key', () => {
      expect(() => {
        sg.parse('constructor "polluted"')
      }).toThrow(ParseError)
    })

    test('rejects prototype key', () => {
      expect(() => {
        sg.parse('prototype "polluted"')
      }).toThrow(ParseError)
    })

    test('rejects dangerous keys in nested objects', () => {
      expect(() => {
        sg.parse(`
parent
  __proto__ "polluted"
`)
      }).toThrow(ParseError)
    })
  })

  describe('path traversal prevention', () => {
    test('fetch blocks path traversal with sandboxDir', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')

      const sandboxDir = path.join(os.tmpdir(), `sandbox-${Date.now()}`)
      fs.mkdirSync(sandboxDir, { recursive: true })
      const configFile = path.join(sandboxDir, 'config.sg')
      fs.writeFileSync(configFile, 'name "test"')

      try {
        // This should work - file is inside sandbox
        const result = sg.fetch('config.sg', { baseDir: sandboxDir, sandboxDir })
        expect(result.name).toBe('test')

        // This should fail - trying to escape sandbox
        expect(() => {
          sg.fetch('../../../etc/passwd', { baseDir: sandboxDir, sandboxDir })
        }).toThrow(ParseError)

        try {
          sg.fetch('../../../etc/passwd', { baseDir: sandboxDir, sandboxDir })
        } catch (e) {
          expect((e as ParseError).message).toContain('Path traversal detected')
        }
      } finally {
        fs.unlinkSync(configFile)
        fs.rmdirSync(sandboxDir)
      }
    })

    test('fetchAsync blocks path traversal with sandboxDir', async () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')

      const sandboxDir = path.join(os.tmpdir(), `sandbox-async-${Date.now()}`)
      fs.mkdirSync(sandboxDir, { recursive: true })
      const configFile = path.join(sandboxDir, 'config.sg')
      fs.writeFileSync(configFile, 'name "async-test"')

      try {
        // This should work
        const result = await sg.fetchAsync('config.sg', { baseDir: sandboxDir, sandboxDir })
        expect(result.name).toBe('async-test')

        // This should fail
        await expect(
          sg.fetchAsync('../../../etc/passwd', { baseDir: sandboxDir, sandboxDir })
        ).rejects.toThrow(ParseError)
      } finally {
        fs.unlinkSync(configFile)
        fs.rmdirSync(sandboxDir)
      }
    })

    test('@ imports respect sandboxDir', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')

      const sandboxDir = path.join(os.tmpdir(), `sandbox-import-${Date.now()}`)
      fs.mkdirSync(sandboxDir, { recursive: true })
      const mainFile = path.join(sandboxDir, 'main.sg')
      const includedFile = path.join(sandboxDir, 'included.sg')

      fs.writeFileSync(includedFile, 'included true')
      fs.writeFileSync(mainFile, 'data @"../../../etc/passwd"')

      try {
        expect(() => {
          sg.fetch('main.sg', { baseDir: sandboxDir, sandboxDir })
        }).toThrow(ParseError)
      } finally {
        fs.unlinkSync(mainFile)
        fs.unlinkSync(includedFile)
        fs.rmdirSync(sandboxDir)
      }
    })
  })

  describe('DoS limits', () => {
    test('enforces maxDepth limit', () => {
      expect(() => {
        sg.parse(`
a
  b
    c
      d
        e "too deep"
`, { maxDepth: 3 })
      }).toThrow(ParseError)

      try {
        sg.parse(`
a
  b
    c
      d "too deep"
`, { maxDepth: 3 })
      } catch (e) {
        expect((e as ParseError).message).toContain('Maximum nesting depth')
      }
    })

    test('allows nesting within maxDepth limit', () => {
      const result = sg.parse(`
a
  b
    c "ok"
`, { maxDepth: 5 })
      expect(result.a.b.c).toBe('ok')
    })

    test('enforces maxArraySize limit', () => {
      expect(() => {
        sg.parse('items [1, 2, 3, 4, 5, 6]', { maxArraySize: 5 })
      }).toThrow(ParseError)

      try {
        sg.parse('items [1, 2, 3, 4, 5, 6]', { maxArraySize: 5 })
      } catch (e) {
        expect((e as ParseError).message).toContain('Array exceeds maximum size')
      }
    })

    test('allows arrays within maxArraySize limit', () => {
      const result = sg.parse('items [1, 2, 3, 4, 5]', { maxArraySize: 5 })
      expect(result.items).toEqual([1, 2, 3, 4, 5])
    })

    test('enforces maxArraySize on multi-line arrays', () => {
      expect(() => {
        sg.parse(`
items [
  1
  2
  3
  4
]
`, { maxArraySize: 3 })
      }).toThrow(ParseError)
    })

    test('enforces maxImportDepth limit', () => {
      const fs = require('node:fs')
      const path = require('node:path')
      const os = require('node:os')

      const tempDir = path.join(os.tmpdir(), `import-depth-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })

      // Create chain of imports: a -> b -> c -> d
      fs.writeFileSync(path.join(tempDir, 'd.sg'), 'value "d"')
      fs.writeFileSync(path.join(tempDir, 'c.sg'), 'c @"d.sg"')
      fs.writeFileSync(path.join(tempDir, 'b.sg'), 'b @"c.sg"')
      fs.writeFileSync(path.join(tempDir, 'a.sg'), 'a @"b.sg"')

      try {
        // Should fail with maxImportDepth of 2
        expect(() => {
          sg.fetch('a.sg', { baseDir: tempDir, maxImportDepth: 2 })
        }).toThrow(ParseError)

        // Should work with higher limit
        const result = sg.fetch('a.sg', { baseDir: tempDir, maxImportDepth: 10 })
        expect(result.a.b.c.value).toBe('d')
      } finally {
        fs.unlinkSync(path.join(tempDir, 'a.sg'))
        fs.unlinkSync(path.join(tempDir, 'b.sg'))
        fs.unlinkSync(path.join(tempDir, 'c.sg'))
        fs.unlinkSync(path.join(tempDir, 'd.sg'))
        fs.rmdirSync(tempDir)
      }
    })

    test('disables limits when set to 0 or Infinity', () => {
      // Deep nesting with limit disabled
      const deepConfig = `
a
  b
    c
      d
        e
          f "deep"
`
      const result1 = sg.parse(deepConfig, { maxDepth: 0 })
      expect(result1.a.b.c.d.e.f).toBe('deep')

      const result2 = sg.parse(deepConfig, { maxDepth: Infinity })
      expect(result2.a.b.c.d.e.f).toBe('deep')

      // Large array with limit disabled
      const largeArray = 'items [' + Array(100).fill('1').join(', ') + ']'
      const result3 = sg.parse(largeArray, { maxArraySize: 0 })
      expect(result3.items.length).toBe(100)
    })
  })
})
