import { describe, test } from 'vitest'
import { readFile } from 'fs/promises'
import { join } from 'path'
import sg from './parser'

const measureTime = (fn: () => void): number => {
  const start = performance.now()
  fn()
  const end = performance.now()
  return (end - start) * 1000 // Convert to microseconds
}

describe('parse stress tests', () => {
  test('simple key-value pairs - 100 items', () => {
    const input = Array.from({ length: 100 }, (_, i) => `key${i} "value${i}"`).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (Object.keys(result).length !== 100) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Simple key-value pairs (100 items): ${time.toFixed(2)} μs`)
  })

  test('deeply nested objects - 10 levels', () => {
    let input = 'level0 value0\n'
    for (let i = 1; i <= 10; i++) {
      input = input.replace(/level(\d+)/, (_, n) => {
        return `level${n}\n${'  '.repeat(i)}level${i} value${i}`
      })
    }
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (!result.level0) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Deeply nested objects (10 levels): ${time.toFixed(2)} μs`)
  })

  test('large arrays - 1000 items', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `"item${i}"`).join(', ')
    const input = `items [${items}]`
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (!Array.isArray(result.items) || result.items.length !== 1000) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Large inline arrays (1000 items): ${time.toFixed(2)} μs`)
  })

  test('multi-line arrays - 500 items', () => {
    const items = Array.from({ length: 500 }, (_, i) => `  "item${i}"`).join('\n')
    const input = `items [\n${items}\n]`
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (!Array.isArray(result.items) || result.items.length !== 500) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Multi-line arrays (500 items): ${time.toFixed(2)} μs`)
  })

  test('large block strings - 10KB', () => {
    const content = 'x'.repeat(10000)
    const input = `text """\n${content}\n"""`
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (result.text.length !== 10000) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Large block strings (10KB): ${time.toFixed(2)} μs`)
  })

  test('multiple block strings - 100 strings', () => {
    const blocks = Array.from({ length: 100 }, (_, i) => 
      `text${i} """\nContent for block ${i}\n"""`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(blocks)
      if (Object.keys(result).length !== 100) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Multiple block strings (100 strings): ${time.toFixed(2)} μs`)
  })

  test('complex nested structure - 50 objects with arrays', () => {
    const objects = Array.from({ length: 50 }, (_, i) => 
      `obj${i}\n  name "Object${i}"\n  tags ["tag1", "tag2", "tag3"]\n  nested\n    value ${i}`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(objects)
      if (Object.keys(result).length !== 50) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Complex nested structure (50 objects): ${time.toFixed(2)} μs`)
  })

  test('repeated keys - 200 repetitions', () => {
    const items = Array.from({ length: 200 }, (_, i) => 
      `item\n  id ${i}\n  name "Item${i}"`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(items)
      if (!Array.isArray(result.item) || result.item.length !== 200) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Repeated keys (200 repetitions): ${time.toFixed(2)} μs`)
  })

  test('mixed types - 500 mixed values', () => {
    const values = Array.from({ length: 500 }, (_, i) => {
      const type = i % 5
      switch (type) {
        case 0: return `key${i} "string${i}"`
        case 1: return `key${i} ${i}`
        case 2: return `key${i} ${i % 2 === 0}`
        case 3: return `key${i} null`
        case 4: return `key${i} 2025-01-01T00:00:00Z`
        default: return `key${i} "default"`
      }
    }).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(values)
      if (Object.keys(result).length !== 500) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Mixed types (500 values): ${time.toFixed(2)} μs`)
  })

  test('very large input - 50KB', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => 
      `key${i} "value${i}"`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(lines)
      if (Object.keys(result).length !== 5000) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Very large input (50KB, 5000 lines): ${time.toFixed(2)} μs`)
  })

  test('block strings with quotes - 50 strings', () => {
    const blocks = Array.from({ length: 50 }, (_, i) => 
      `code${i} """\nfunction test${i}() {\n  console.log("Hello ${i}")\n  return true\n}\n"""`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(blocks)
      if (Object.keys(result).length !== 50) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Block strings with quotes (50 strings): ${time.toFixed(2)} μs`)
  })

  test('nested arrays - 5 levels deep', () => {
    let input = 'arr [[[[["deep"]]]]]'
    const time = measureTime(() => {
      const result = sg.parse(input)
      if (!Array.isArray(result.arr)) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Nested arrays (5 levels): ${time.toFixed(2)} μs`)
  })

  test('comments everywhere - 1000 lines with comments', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => 
      i % 2 === 0 ? `# Comment ${i}\nkey${i} "value${i}"` : `key${i} "value${i}" # Inline comment`
    ).join('\n')
    const time = measureTime(() => {
      const result = sg.parse(lines)
      if (Object.keys(result).length !== 1000) {
        throw new Error('Unexpected result')
      }
    })
    console.log(`✓ Comments everywhere (1000 lines): ${time.toFixed(2)} μs`)
  })

  test('giant.sg file - 100k lines with all features', async () => {
    const filePath = join(process.cwd(), 'giant.sg')
    const loadStart = performance.now()
    const content = await readFile(filePath, 'utf-8')
    const loadTime = (performance.now() - loadStart) * 1000
    
    const parseTime = measureTime(() => {
      const result = sg.parse(content)
      if (!result || Object.keys(result).length === 0) {
        throw new Error('Unexpected result')
      }
    })
    
    const totalTime = loadTime + parseTime
    const lines = content.split('\n').length
    
    console.log(`✓ giant.sg file (${lines.toLocaleString()} lines):`)
    console.log(`    - File load time: ${loadTime.toFixed(2)} μs`)
    console.log(`    - Parse time: ${parseTime.toFixed(2)} μs`)
    console.log(`    - Total time: ${totalTime.toFixed(2)} μs`)
    console.log(`    - Top-level keys: ${Object.keys(sg.parse(content)).length}`)
  })
})

