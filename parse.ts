/**
 * Main SlimGym parser.
 */

import { ParseError, type NodeObject, type NodeValue } from './types.js'
import { wrapParsedConfig } from './config-wrapper.js'
import { DANGEROUS_KEYS, DEFAULT_MAX_DEPTH, DEFAULT_MAX_ARRAY_SIZE } from './security.js'
import {
  type ParseOptions,
  findInlineArrayClose,
  parseArrayItems,
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

type ArrayState = {
  array: NodeValue[]
  arrayIndent: number
}

type BlockState = {
  lines: string[]
  baseIndent: number
  blockIndent: number | null
  parent: NodeObject
  key: string
  forceArray: boolean
}

type ArrayBlockState = {
  lines: string[]
  baseIndent: number
  blockIndent: number | null
  array: NodeValue[]
}

const attachValue = (parent: NodeObject, key: string, value: NodeValue, forceArray: boolean): void => {
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
}

const buildBlockStringValue = (lines: string[]): string => lines.join('\n')

const toLineAsyncIterable = async function* (input: AsyncIterable<string | Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  for await (const chunk of input) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    buffer += text

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      yield line
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  }

  buffer += decoder.decode()
  if (buffer.length > 0) {
    if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1)
    yield buffer
  }
}

export const parseStream = async <T = any>(
  input: AsyncIterable<string | Uint8Array>,
  options?: ParseOptions
): Promise<T> => {
  if (input == null || typeof (input as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function') {
    throw new ParseError('Input must be an async iterable')
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxArraySize = options?.maxArraySize ?? DEFAULT_MAX_ARRAY_SIZE
  const effectiveOptions: ParseOptions = options?._importCache
    ? options
    : { ...options, _importCache: new Map() }

  const root: NodeObject = {}
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }]
  let lineIndex = 0
  let lastLine = ''
  let arrayState: ArrayState | null = null
  let blockState: BlockState | null = null
  let arrayBlockState: ArrayBlockState | null = null

  const parseValueWithOptions = (token: string, lineNumber?: number, line?: string, columnNumber?: number): NodeValue => {
    return parseValue(token, effectiveOptions, lineNumber, line, columnNumber)
  }

  for await (const line of toLineAsyncIterable(input)) {
    lastLine = line

    if (blockState !== null) {
      let indent = 0
      let m = 0
      while (m < line.length && line.charCodeAt(m) === 32) {
        indent++
        m++
      }

      if (m === line.length) {
        if (blockState.blockIndent !== null) blockState.lines.push('')
      } else if (
        indent <= blockState.baseIndent &&
        line.length - m === 3 &&
        line.slice(m) === '"""'
      ) {
        const value = buildBlockStringValue(blockState.lines)
        attachValue(blockState.parent, blockState.key, value, blockState.forceArray)
        blockState = null
      } else {
        blockState.blockIndent ??= indent
        blockState.lines.push(
          indent >= blockState.blockIndent
            ? line.slice(blockState.blockIndent)
            : line.slice(m)
        )
      }

      lineIndex++
      continue
    }

    if (arrayBlockState !== null) {
      let indent = 0
      let m = 0
      while (m < line.length && line.charCodeAt(m) === 32) {
        indent++
        m++
      }

      if (
        indent <= arrayBlockState.baseIndent &&
        line.length - m === 3 &&
        line.slice(m) === '"""'
      ) {
        const value = buildBlockStringValue(arrayBlockState.lines)
        arrayBlockState.array.push(value)
        arrayBlockState = null
      } else if (m === line.length) {
        if (arrayBlockState.blockIndent !== null) arrayBlockState.lines.push('')
      } else {
        arrayBlockState.blockIndent ??= indent
        arrayBlockState.lines.push(
          indent >= arrayBlockState.blockIndent
            ? line.slice(arrayBlockState.blockIndent)
            : line.slice(m)
        )
      }

      lineIndex++
      continue
    }

    if (arrayState !== null) {
      let indent = 0
      let k = 0
      while (k < line.length && line.charCodeAt(k) === 32) {
        indent++
        k++
      }

      // Skip blank/comment
      if (k === line.length || (line.charCodeAt(k) === 35 && (k + 1 === line.length || line.charCodeAt(k + 1) === 32))) {
        lineIndex++
        continue
      }

      // Closing bracket
      if (line.charCodeAt(k) === 93 && indent <= arrayState.arrayIndent) {
        if (maxArraySize > 0 && maxArraySize !== Infinity && arrayState.array.length > maxArraySize) {
          throw new ParseError(
            `Array exceeds maximum size of ${maxArraySize}`,
            lineIndex,
            line,
            indent
          )
        }
        arrayState = null
        lineIndex++
        continue
      }

      if (indent <= arrayState.arrayIndent) {
        throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex, line, indent)
      }

      const itemContent = line.slice(k).trim()

      if (itemContent === '"""') {
        arrayBlockState = {
          lines: [],
          baseIndent: indent,
          blockIndent: null,
          array: arrayState.array,
        }
        lineIndex++
        continue
      }

      let cleaned = itemContent
      if (cleaned.endsWith(',')) cleaned = cleaned.slice(0, -1).trim()
      if (cleaned.length > 0) {
        arrayState.array.push(parseValueWithOptions(cleaned, lineIndex, line, k))
        if (maxArraySize > 0 && maxArraySize !== Infinity && arrayState.array.length > maxArraySize) {
          throw new ParseError(
            `Array exceeds maximum size of ${maxArraySize}`,
            lineIndex,
            line,
            k
          )
        }
      }

      lineIndex++
      continue
    }

    const lineEnd = line.length
    let indent = 0
    let i = 0
    while (i < lineEnd && line.charCodeAt(i) === 32) {
      indent++
      i++
    }

    if (i === lineEnd) {
      lineIndex++
      continue
    }

    // Skip full-line comments (# followed by space or end of line)
    if (line.charCodeAt(i) === 35 && (i + 1 === lineEnd || line.charCodeAt(i + 1) === 32)) {
      lineIndex++
      continue
    }

    const keyStart = i
    while (i < lineEnd && line.charCodeAt(i) !== 32) i++

    const rawKey = line.slice(keyStart, i)
    let key = rawKey
    let forceArray = false

    if (key.startsWith('[]')) {
      forceArray = true
      key = key.slice(2)
    }

    for (let k = 0; k < key.length; k++) {
      if (!isValidKeyCharCode(key.charCodeAt(k))) {
        const columnNumber = keyStart + k + (forceArray ? 2 : 0)
        throw new ParseError(`Invalid key format: "${rawKey}"`, lineIndex, line, columnNumber)
      }
    }

    if (DANGEROUS_KEYS.has(key)) {
      const columnNumber = keyStart + (forceArray ? 2 : 0)
      throw new ParseError(`Forbidden key "${key}" (potential prototype pollution)`, lineIndex, line, columnNumber)
    }

    while (i < lineEnd && line.charCodeAt(i) === 32) i++

    let value: NodeValue
    let isMultiLineArray = false
    let isBlockString = false

    if (i < lineEnd) {
      // If line has only a comment after the key (`key # comment`), treat it as no-value.
      if (line.charCodeAt(i) === 35 && (i + 1 === lineEnd || line.charCodeAt(i + 1) === 32)) {
        value = {}
      } else {
        const valueEnd = findValueTokenEnd(line, i, lineEnd)
        if (valueEnd === i) {
          value = {}
        } else {
          const char = line.charCodeAt(i)

          if (char === 91) { // [
            const closingIdx = findInlineArrayClose(line, i, lineEnd)
            if (closingIdx !== -1) {
              const arrayContent = line.slice(i + 1, closingIdx)
              value = arrayContent.trim().length === 0
                ? []
                : parseArrayItems(
                  arrayContent,
                  parseValueWithOptions,
                  maxArraySize,
                  lineIndex,
                  line,
                  i + 1
                )
            } else {
              value = []
              isMultiLineArray = true
            }
          } else if (char === 34 && line.charCodeAt(i + 1) === 34 && line.charCodeAt(i + 2) === 34) {
            value = ''
            isBlockString = true
          } else {
            value = parseValueWithOptions(line.slice(i, valueEnd), lineIndex, line, i)
          }
        }
      }
    } else {
      value = {}
    }

    // Attach to parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1].obj

    if (isBlockString) {
      blockState = {
        lines: [],
        baseIndent: indent,
        blockIndent: null,
        parent,
        key,
        forceArray,
      }
      lineIndex++
      continue
    }

    attachValue(parent, key, value, forceArray)

    if (isMultiLineArray) {
      arrayState = {
        array: value as NodeValue[],
        arrayIndent: indent,
      }
      lineIndex++
      continue
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      if (maxDepth > 0 && maxDepth !== Infinity && stack.length >= maxDepth) {
        const columnNumber = keyStart
        throw new ParseError(`Maximum nesting depth of ${maxDepth} exceeded`, lineIndex, line, columnNumber)
      }
      stack.push({ indent, obj: value })
    }

    lineIndex++
  }

  if (arrayBlockState !== null || arrayState !== null) {
    const columnNumber = arrayState?.arrayIndent ?? 0
    throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex - 1, lastLine, columnNumber)
  }

  if (blockState !== null) {
    const value = buildBlockStringValue(blockState.lines)
    attachValue(blockState.parent, blockState.key, value, blockState.forceArray)
  }

  return wrapParsedConfig<T>(root as T)
}

// Initialize cross-module references
setParseFunction(parse)
setFetchParseFunction(parse)
