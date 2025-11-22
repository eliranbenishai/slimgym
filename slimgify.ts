import { type NodeValue } from './types.js'

const slimgifyValue = (value: NodeValue, indentLevel = 0): string => {
  // Handle null and undefined
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  // Handle Date objects
  if (value instanceof Date) {
    return value.toISOString()
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  // Handle numbers
  if (typeof value === 'number') {
    return value.toString()
  }

  // Handle strings
  if (typeof value === 'string') {
    // Use block string if contains newlines
    if (value.includes('\n')) {
      const indent = '  '.repeat(indentLevel + 1)
      const lines = value.split('\n')
      const baseIndent = '  '.repeat(indentLevel)
      return `"""\n${lines.map(line => `${indent}${line}`).join('\n')}\n${baseIndent}"""`
    }
    
    // Check if quoting is needed
    const needsQuoting = value.includes(' ') || 
                         value.includes('\t') ||
                         value === '' ||
                         /^[0-9]/.test(value) ||
                         value === 'true' ||
                         value === 'false' ||
                         value === 'null' ||
                         value === 'undefined' ||
                         /^\d{4}-\d{2}-\d{2}/.test(value) // Looks like a date
    
    if (needsQuoting) {
      // Escape special characters
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
      return `"${escaped}"`
    }
    
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return slimgifyArray(value, indentLevel)
  }

  // Handle objects (after checking arrays and other types, value must be an object)
  if (typeof value === 'object') {
    return slimgifyObject(value, indentLevel)
  }

  return String(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slimgifyArray = (arr: any[], indentLevel = 0): string => {
  // Empty array
  if (arr.length === 0) {
    return '[]'
  }

  // Decide between inline and multi-line format
  const shouldUseMultiLine = arr.length > 3 || arr.some(item => 
    (typeof item === 'object' && item !== null && !Array.isArray(item) && !(item instanceof Date)) ||
    (typeof item === 'string' && item.includes('\n'))
  )

  if (shouldUseMultiLine) {
    const indent = '  '.repeat(indentLevel)
    const itemIndent = '  '.repeat(indentLevel + 1)
    const arrayLines: string[] = []
    for (const item of arr) {
      // Check if item is a block string
      if (typeof item === 'string' && item.includes('\n')) {
        // Format block string with proper indentation
        arrayLines.push(`${itemIndent}"""`)
        const blockLines = item.split('\n')
        const blockIndent = '  '.repeat(indentLevel + 2)
        for (const blockLine of blockLines) {
          arrayLines.push(`${blockIndent}${blockLine}`)
        }
        arrayLines.push(`${itemIndent}"""`)
      } else {
        // Simple value - format it
        // Always quote strings in multi-line arrays
        let itemStr: string
        if (typeof item === 'string' && !item.includes('\n')) {
          const escaped = item
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
          itemStr = `"${escaped}"`
        } else {
          itemStr = slimgifyValue(item, 0)
        }
        arrayLines.push(`${itemIndent}${itemStr}`)
      }
    }
    return `[\n${arrayLines.join('\n')}\n${indent}]`
  } else {
    // Inline array
    const items = arr.map(item => {
      // Always quote strings in arrays
      if (typeof item === 'string') {
        const escaped = item
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
        return `"${escaped}"`
      }
      return slimgifyValue(item, 0)
    })
    return `[${items.join(', ')}]`
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slimgifyObject = (obj: any, indentLevel = 0): string => {
  const indent = '  '.repeat(indentLevel)
  const lines: string[] = []
  const keys = Object.keys(obj)
  
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const value = obj[key]
    
    // Handle arrays - serialize as array syntax, not repeated keys
    if (Array.isArray(value)) {
      const arrayStr = slimgifyArray(value, indentLevel)
      lines.push(`${indent}${key} ${arrayStr}`)
    } else {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        // Nested object
        lines.push(`${indent}${key}`)
        const nestedLines = slimgifyObject(value, indentLevel + 1).split('\n')
        lines.push(...nestedLines)
      } else {
        // Simple value
        // Check if it's a block string (contains newlines)
        if (typeof value === 'string' && value.includes('\n')) {
          // Block string - format specially
          lines.push(`${indent}${key} """`)
          const blockLines = value.split('\n')
          const blockIndent = '  '.repeat(indentLevel + 1)
          for (const blockLine of blockLines) {
            lines.push(`${blockIndent}${blockLine}`)
          }
          lines.push(`${indent}"""`)
        } else {
          // Regular value
          // Quote strings in object values for consistency with example file
          let valueStr: string
          if (typeof value === 'string' && !value.includes('\n')) {
            const escaped = value
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t')
            valueStr = `"${escaped}"`
          } else {
            valueStr = slimgifyValue(value, indentLevel)
          }
          lines.push(`${indent}${key} ${valueStr}`)
        }
      }
    }
  }
  
  return lines.join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const slimgify = (obj: any): string => {
  if (obj === null || obj === undefined) {
    return ''
  }

  // Handle arrays and dates first (they are objects in JS)
  if (Array.isArray(obj) || obj instanceof Date) {
    return slimgifyValue(obj, 0)
  }

  // If it's not an object, wrap it
  if (typeof obj !== 'object') {
    return slimgifyValue(obj, 0)
  }

  // Handle objects
  return slimgifyObject(obj, 0)
}
