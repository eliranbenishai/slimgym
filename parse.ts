/**
 * Main SlimGym parser.
 */

import { ParseError, type NodeObject, type NodeValue } from './types.js'
import { wrapParsedConfig } from './config-wrapper.js'
import { DANGEROUS_KEYS, DEFAULT_MAX_DEPTH, DEFAULT_MAX_ARRAY_SIZE } from './security.js'
import {
  type ParseOptions,
  findInlineArrayClose,
  parseArrayValue,
  parseMultiLineArray,
  parseBlockString,
  parseValue,
  setParseFunction,
} from './parser-helpers.js'
import { setFetchParseFunction } from './fetch.js'

// Re-export types and functions
export { type ParseOptions } from './parser-helpers.js'
export { type FetchOptions, type FetchUrlOptions, fetch, fetchAsync, fetchUrl } from './fetch.js'
export { type FindOptions, type FindResult } from './config-wrapper.js'

/**
 * Parses a SlimGym string into a JavaScript object.
 */
export const parse = <T = any>(input: string, options?: ParseOptions): T => {
  if (typeof input !== 'string') {
    throw new ParseError('Input must be a string')
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxArraySize = options?.maxArraySize ?? DEFAULT_MAX_ARRAY_SIZE

  const len = input.length
  let pos = 0
  let lineStart = 0
  let lineIndex = 0

  const root: NodeObject = {}
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }]

  const parseValueWithOptions = (token: string, lineNumber?: number, line?: string): NodeValue => {
    return parseValue(token, options, lineNumber, line)
  }

  while (pos < len) {
    let lineEnd = input.indexOf('\n', pos)
    if (lineEnd === -1) lineEnd = len

    // Calculate indent
    let indent = 0
    let i = lineStart
    while (i < lineEnd && input.charCodeAt(i) === 32) {
      indent++
      i++
    }

    // Skip empty lines
    if (i === lineEnd) {
      lineIndex++
      pos = lineEnd + 1
      lineStart = pos
      continue
    }

    // Skip comments (# followed by space or end of line)
    if (input.charCodeAt(i) === 35 && (i + 1 === lineEnd || input.charCodeAt(i + 1) === 32)) {
        lineIndex++
        pos = lineEnd + 1
        lineStart = pos
        continue
    }

    // Parse key
    const keyStart = i
    while (i < lineEnd && input.charCodeAt(i) !== 32) i++

    let key = input.slice(keyStart, i)
    let forceArray = false

    if (key.startsWith('[]')) {
      forceArray = true
      key = key.slice(2)
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new ParseError(`Invalid key format: "${input.slice(keyStart, i)}"`, lineIndex, input.slice(lineStart, lineEnd))
    }

    if (DANGEROUS_KEYS.has(key)) {
      throw new ParseError(`Forbidden key "${key}" (potential prototype pollution)`, lineIndex, input.slice(lineStart, lineEnd))
    }

    // Skip spaces after key
    while (i < lineEnd && input.charCodeAt(i) === 32) i++

    let value: NodeValue

    if (i === lineEnd) {
      // No value -> empty object
      value = {}
      pos = lineEnd + 1
      lineIndex++
      lineStart = pos
    } else {
      const char = input.charCodeAt(i)

      if (char === 91) { // [
        value = parseArrayValue(input, i, lineEnd, lineIndex, lineStart, parseValueWithOptions, maxArraySize)
        // Check if it was an inline array or multi-line
        const closingIdx = findInlineArrayClose(input, i, lineEnd)
        if (closingIdx !== -1) {
          pos = lineEnd + 1
          lineIndex++
          lineStart = pos
        } else {
          // Multi-line array
          const result = parseMultiLineArray(input, lineEnd + 1, indent, len, parseValueWithOptions, maxArraySize, lineIndex + 1)
          value = result.value
          pos = result.pos
          lineIndex = result.lineIndex
          lineStart = pos
        }
      } else if (char === 34 && input.charCodeAt(i + 1) === 34 && input.charCodeAt(i + 2) === 34) {
        // Block string """
        const result = parseBlockString(input, lineEnd + 1, indent, len)
        value = result.value
        pos = result.pos
        lineIndex = result.lineIndex
        lineStart = pos
      } else {
        // Simple value
        value = parseValueWithOptions(input.slice(i, lineEnd).trim(), lineIndex, input.slice(lineStart, lineEnd))
        pos = lineEnd + 1
        lineIndex++
        lineStart = pos
      }
    }

    // Attach to parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1].obj

    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      const existing = parent[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        parent[key] = [existing, value]
      }
    } else {
      parent[key] = forceArray ? [value] : value
    }

    // Push object values to stack
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      if (maxDepth > 0 && maxDepth !== Infinity && stack.length >= maxDepth) {
        throw new ParseError(`Maximum nesting depth of ${maxDepth} exceeded`, lineIndex, input.slice(lineStart, lineEnd))
      }
      stack.push({ indent, obj: value })
    }
  }

  return wrapParsedConfig<T>(root as T)
}

// Initialize cross-module references
setParseFunction(parse)
setFetchParseFunction(parse)
