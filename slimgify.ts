import { type NodeValue } from './types.js'

const ESCAPE_REGEX = /["\\\n\r\t]/g
const ESCAPE_MAP: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

const escapeString = (str: string): string => {
  return str.replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char])
}

const slimgifyValue = (value: NodeValue, buffer: string[], indent: string): void => {
  // Handle null and undefined
  if (value === null) {
    buffer.push('null')
    return
  }
  if (value === undefined) {
    buffer.push('undefined')
    return
  }

  // Handle Date objects
  if (value instanceof Date) {
    buffer.push(value.toISOString())
    return
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    buffer.push(value ? 'true' : 'false')
    return
  }

  // Handle numbers
  if (typeof value === 'number') {
    buffer.push(value.toString())
    return
  }

  // Handle strings
  if (typeof value === 'string') {
    // Use block string if contains newlines
    if (value.includes('\n')) {
      const contentIndent = `${indent}  `
      buffer.push('"""')

      let start = 0
      let pos = value.indexOf('\n')
      while (pos !== -1) {
        buffer.push('\n', contentIndent, value.slice(start, pos))
        start = pos + 1
        pos = value.indexOf('\n', start)
      }
      buffer.push('\n', contentIndent, value.slice(start))
      buffer.push('\n', indent, '"""')
      return
    }

    // Check if quoting is needed
    const needsQuoting = value.includes(' ') ||
      value.includes('\t') ||
      value === '' ||
      (value.length > 0 && value.charCodeAt(0) >= 48 && value.charCodeAt(0) <= 57) || // Starts with digit
      value === 'true' ||
      value === 'false' ||
      value === 'null' ||
      value === 'undefined' ||
      (value.length >= 10 && value.charCodeAt(4) === 45 && value.charCodeAt(7) === 45) // Looks like date 2025-01-01

    if (needsQuoting) {
      buffer.push('"', escapeString(value), '"')
    } else {
      buffer.push(value)
    }
    return
  }

  // Handle arrays
  if (Array.isArray(value)) {
    slimgifyArray(value, buffer, indent)
    return
  }

  // Handle objects
  if (typeof value === 'object') {
    slimgifyObject(value, buffer, indent)
    return
  }

  buffer.push(String(value))
}

const slimgifyArray = (arr: any[], buffer: string[], indent: string): void => {
  // Empty array
  if (arr.length === 0) {
    buffer.push('[]')
    return
  }

  // Decide between inline and multi-line format
  const shouldUseMultiLine = arr.length > 3 || arr.some(item =>
    (typeof item === 'object' && item !== null && !Array.isArray(item) && !(item instanceof Date)) ||
    (typeof item === 'string' && item.includes('\n'))
  )

  if (shouldUseMultiLine) {
    const itemIndent = `${indent}  `
    buffer.push('[')

    for (const item of arr) {
      buffer.push('\n', itemIndent)

      // Check if item is a block string
      if (typeof item === 'string' && item.includes('\n')) {
        buffer.push('"""')
        const blockIndent = `${itemIndent}  `

        let start = 0
        let pos = item.indexOf('\n')
        while (pos !== -1) {
          buffer.push('\n', blockIndent, item.slice(start, pos))
          start = pos + 1
          pos = item.indexOf('\n', start)
        }
        buffer.push('\n', blockIndent, item.slice(start))
        buffer.push('\n', itemIndent, '"""')
      } else {
        // Simple value - format it
        // Always quote strings in multi-line arrays
        if (typeof item === 'string' && !item.includes('\n')) {
          buffer.push('"', escapeString(item), '"')
        } else {
          slimgifyValue(item, buffer, itemIndent)
        }
      }
    }
    buffer.push('\n', indent, ']')
  } else {
    // Inline array
    buffer.push('[')
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) buffer.push(', ')
      const item = arr[i]

      // Always quote strings in arrays
      if (typeof item === 'string') {
        buffer.push('"', escapeString(item), '"')
      } else {
        slimgifyValue(item, buffer, indent)
      }
    }
    buffer.push(']')
  }
}

const slimgifyObject = (obj: any, buffer: string[], indent: string): void => {
  const keys = Object.keys(obj)
  const len = keys.length

  for (let i = 0; i < len; i++) {
    const key = keys[i]
    const value = obj[key]

    // Check if value is an array of plain objects
    const isArrayOfObjects = Array.isArray(value) &&
      value.length > 0 &&
      value.every((item: any) => typeof item === 'object' && item !== null && !Array.isArray(item) && !(item instanceof Date))

    if (isArrayOfObjects) {
      for (let j = 0; j < value.length; j++) {
        if (i > 0 || j > 0) buffer.push('\n')
        buffer.push(indent, key)
        buffer.push('\n')
        slimgifyObject(value[j], buffer, `${indent}  `)
      }
      continue
    }

    if (i > 0) buffer.push('\n')

    // Handle arrays - serialize as array syntax, not repeated keys
    if (Array.isArray(value)) {
      // Check for single item array - use @key syntax
      if (value.length === 1) {
        buffer.push(indent, '@', key, ' ')
        const item = value[0]
        if (typeof item === 'string') {
          if (!item.includes('\n')) {
            buffer.push('"', escapeString(item), '"')
          } else {
            // Block string logic
            buffer.push('"""')
            const blockIndent = `${indent}  `
            let start = 0
            let pos = item.indexOf('\n')
            while (pos !== -1) {
              buffer.push('\n', blockIndent, item.slice(start, pos))
              start = pos + 1
              pos = item.indexOf('\n', start)
            }
            buffer.push('\n', blockIndent, item.slice(start))
            buffer.push('\n', indent, '"""')
          }
        } else {
          slimgifyValue(item, buffer, indent)
        }
      } else {
        buffer.push(indent, key, ' ')
        slimgifyArray(value, buffer, indent)
      }
    } else {
      buffer.push(indent, key)
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        // Nested object
        buffer.push('\n')
        slimgifyObject(value, buffer, `${indent}  `)
      } else {
        // Simple value
        buffer.push(' ')
        // Check if it's a block string (contains newlines)
        if (typeof value === 'string' && value.includes('\n')) {
          // Block string - format specially
          buffer.push('"""')
          const blockIndent = `${indent}  `

          let start = 0
          let pos = value.indexOf('\n')
          while (pos !== -1) {
            buffer.push('\n', blockIndent, value.slice(start, pos))
            start = pos + 1
            pos = value.indexOf('\n', start)
          }
          buffer.push('\n', blockIndent, value.slice(start))
          buffer.push('\n', indent, '"""')
        } else {
          // Regular value
          // Quote strings in object values for consistency with example file
          if (typeof value === 'string' && !value.includes('\n')) {
            buffer.push('"', escapeString(value), '"')
          } else {
            slimgifyValue(value, buffer, indent)
          }
        }
      }
    }
  }
}

export const slimgify = (obj: any): string => {
  if (obj === null || obj === undefined) {
    return ''
  }

  const buffer: string[] = []

  // Handle arrays and dates first (they are objects in JS)
  if (Array.isArray(obj) || obj instanceof Date) {
    slimgifyValue(obj, buffer, '')
    return buffer.join('')
  }

  // If it's not an object, wrap it
  if (typeof obj !== 'object') {
    slimgifyValue(obj, buffer, '')
    return buffer.join('')
  }

  // Handle objects
  slimgifyObject(obj, buffer, '')
  return buffer.join('')
}
