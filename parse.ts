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
export { type FetchOptions, type FetchUrlOptions, file, fileAsync, fetch } from './fetch.js'
export { type FindOptions, type FindResult } from './config-wrapper.js'

const isValidKeyCharCode = (code: number): boolean => {
  // a-z
  if (code >= 97 && code <= 122) return true
  // A-Z
  if (code >= 65 && code <= 90) return true
  // 0-9
  if (code >= 48 && code <= 57) return true
  // '_' or '-'
  return code === 95 || code === 45
}

/**
 * Finds the end index (exclusive) of a value token on a single line.
 * Trims trailing spaces and strips inline comments (` # ...`) while respecting quoted strings.
 */
const findValueTokenEnd = (input: string, start: number, lineEnd: number): number => {
  let inString = false
  let quoteChar = -1

  for (let j = start; j < lineEnd; j++) {
    const c = input.charCodeAt(j)

    if (inString) {
      // End quote if not escaped
      if (c === quoteChar && input.charCodeAt(j - 1) !== 92) {
        inString = false
        quoteChar = -1
      }
      continue
    }

    if (c === 34 || c === 39) { // " or '
      inString = true
      quoteChar = c
      continue
    }

    if (c === 35) { // #
      // Inline comment only when preceded by a space and followed by space or EOL.
      if (j > start && input.charCodeAt(j - 1) === 32 && (j + 1 === lineEnd || input.charCodeAt(j + 1) === 32)) {
        let end = j - 1
        while (end > start && input.charCodeAt(end - 1) === 32) end--
        return end
      }
    }
  }

  let end = lineEnd
  while (end > start && input.charCodeAt(end - 1) === 32) end--
  return end
}

/**
 * Parses a SlimGym string into a JavaScript object.
 */
export const parse = <T = any>(input: string, options?: ParseOptions): T => {
  if (typeof input !== 'string') {
    throw new ParseError('Input must be a string')
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxArraySize = options?.maxArraySize ?? DEFAULT_MAX_ARRAY_SIZE

  // Initialize import cache at root level to reuse parsed files
  const effectiveOptions: ParseOptions = options?._importCache
    ? options
    : { ...options, _importCache: new Map() }

  const len = input.length
  let pos = 0
  let lineIndex = 0

  const root: NodeObject = {}
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }]

  const parseValueWithOptions = (token: string, lineNumber?: number, line?: string, columnNumber?: number): NodeValue => {
    return parseValue(token, effectiveOptions, lineNumber, line, columnNumber)
  }

  while (pos < len) {
    const lineStart = pos
    let lineEnd = input.indexOf('\n', lineStart)
    if (lineEnd === -1) lineEnd = len

    let indent = 0
    let i = lineStart
    while (i < lineEnd && input.charCodeAt(i) === 32) {
      indent++
      i++
    }

    if (i === lineEnd) {
      lineIndex++
      pos = lineEnd + 1
      continue
    }

    // Skip full-line comments (# followed by space or end of line)
    if (input.charCodeAt(i) === 35 && (i + 1 === lineEnd || input.charCodeAt(i + 1) === 32)) {
      lineIndex++
      pos = lineEnd + 1
      continue
    }

    const line = input.slice(lineStart, lineEnd)

    const keyStart = i
    while (i < lineEnd && input.charCodeAt(i) !== 32) i++

    const rawKey = input.slice(keyStart, i)
    let key = rawKey
    let forceArray = false

    if (key.startsWith('[]')) {
      forceArray = true
      key = key.slice(2)
    }

    for (let k = 0; k < key.length; k++) {
      if (!isValidKeyCharCode(key.charCodeAt(k))) {
        const columnNumber = (keyStart - lineStart) + k + (forceArray ? 2 : 0)
        throw new ParseError(`Invalid key format: "${rawKey}"`, lineIndex, line, columnNumber)
      }
    }

    if (DANGEROUS_KEYS.has(key)) {
      const columnNumber = (keyStart - lineStart) + (forceArray ? 2 : 0)
      throw new ParseError(`Forbidden key "${key}" (potential prototype pollution)`, lineIndex, line, columnNumber)
    }

    while (i < lineEnd && input.charCodeAt(i) === 32) i++

    let value: NodeValue

    if (i < lineEnd) {
      // If line has only a comment after the key (`key # comment`), treat it as no-value.
      if (input.charCodeAt(i) === 35 && (i + 1 === lineEnd || input.charCodeAt(i + 1) === 32)) {
        value = {}
        pos = lineEnd + 1
        lineIndex++
      } else {
        const valueEnd = findValueTokenEnd(input, i, lineEnd)
        if (valueEnd === i) {
          value = {}
          pos = lineEnd + 1
          lineIndex++
        } else {
          const char = input.charCodeAt(i)

          if (char === 91) { // [
            value = parseArrayValue(input, i, lineEnd, lineIndex, lineStart, parseValueWithOptions, maxArraySize)
            // Check if it was an inline array or multi-line
            const closingIdx = findInlineArrayClose(input, i, lineEnd)
            if (closingIdx !== -1) {
              pos = lineEnd + 1
              lineIndex++
            } else {
              // Multi-line array
              const result = parseMultiLineArray(input, lineEnd + 1, indent, len, parseValueWithOptions, maxArraySize, lineIndex + 1)
              value = result.value
              pos = result.pos
              lineIndex = result.lineIndex
            }
          } else if (char === 34 && input.charCodeAt(i + 1) === 34 && input.charCodeAt(i + 2) === 34) {
            // Block string """
            const result = parseBlockString(input, lineEnd + 1, indent, len)
            value = result.value
            pos = result.pos
            lineIndex = result.lineIndex
          } else {
            // Simple value (strip inline comments and trailing spaces)
            value = parseValueWithOptions(input.slice(i, valueEnd), lineIndex, line, i - lineStart)
            pos = lineEnd + 1
            lineIndex++
          }
        }
      }
    } else {
      // No value -> empty object
      value = {}
      pos = lineEnd + 1
      lineIndex++
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

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      if (maxDepth > 0 && maxDepth !== Infinity && stack.length >= maxDepth) {
        const columnNumber = keyStart - lineStart
        throw new ParseError(`Maximum nesting depth of ${maxDepth} exceeded`, lineIndex, line, columnNumber)
      }
      stack.push({ indent, obj: value })
    }
  }

  return wrapParsedConfig<T>(root as T)
}

// Initialize cross-module references
setParseFunction(parse)
setFetchParseFunction(parse)
