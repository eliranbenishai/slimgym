/**
 * Parser helper functions for arrays, block strings, and value parsing.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { ParseError, type NodeValue } from './types.js'
import { DEFAULT_MAX_IMPORT_DEPTH, validatePathSandbox } from './security.js'

export interface ParseOptions {
  baseDir?: string
  /** Maximum nesting depth for objects. Defaults to 100. Set to 0 or Infinity to disable. */
  maxDepth?: number
  /** Maximum number of items in an array. Defaults to 10000. Set to 0 or Infinity to disable. */
  maxArraySize?: number
  /** Maximum depth of @import chains. Defaults to 10. Set to 0 or Infinity to disable. */
  maxImportDepth?: number
  /** @internal */
  _ancestors?: Set<string>
  /** @internal */
  _importDepth?: number
  /** @internal */
  _sandboxDir?: string
  /** @internal Cache for imported files to avoid re-reading/parsing the same file */
  _importCache?: Map<string, NodeValue>
}

export interface BlockStringResult {
  value: string
  pos: number
  lineIndex: number
}

export interface MultiLineArrayResult {
  value: NodeValue[]
  pos: number
  lineIndex: number
}

export type ValueParser = (token: string, lineNumber?: number, line?: string, columnNumber?: number) => NodeValue

// ─────────────────────────────────────────────────────────────────────────────
// Array Parsing
// ─────────────────────────────────────────────────────────────────────────────

export const findInlineArrayClose = (input: string, start: number, lineEnd: number): number => {
  for (let j = lineEnd - 1; j > start; j--) {
    if (input.charCodeAt(j) === 93) return j
  }
  return -1
}

export const parseArrayValue = (
  input: string,
  i: number,
  lineEnd: number,
  lineIndex: number,
  lineStart: number,
  parseValueWithOptions: ValueParser,
  maxArraySize: number
): NodeValue[] => {
  const closingIdx = findInlineArrayClose(input, i, lineEnd)

  if (closingIdx !== -1) {
    const arrayContent = input.slice(i + 1, closingIdx)
    if (arrayContent.trim().length === 0) return []
    return parseArrayItems(
      arrayContent,
      parseValueWithOptions,
      maxArraySize,
      lineIndex,
      input.slice(lineStart, lineEnd),
      (i + 1) - lineStart
    )
  }

  // Return empty array as placeholder - actual parsing happens in main loop
  return []
}

export const parseMultiLineArray = (
  input: string,
  startPos: number,
  arrayIndent: number,
  len: number,
  parseValueWithOptions: ValueParser,
  maxArraySize: number,
  startLineIndex: number
): MultiLineArrayResult => {
  const items: string[] = []
  let pos = startPos
  let lineIndex = startLineIndex
  let lastLine = ''

  while (pos < len) {
    let lineEnd = input.indexOf('\n', pos)
    if (lineEnd === -1) lineEnd = len
    const line = input.slice(pos, lineEnd)
    lastLine = line

    let indent = 0
    let k = pos
    while (k < lineEnd && input.charCodeAt(k) === 32) {
      indent++
      k++
    }

    // Skip blank/comment
    if (k === lineEnd || (input.charCodeAt(k) === 35 && (k + 1 === lineEnd || input.charCodeAt(k + 1) === 32))) {
      pos = lineEnd + 1
      lineIndex++
      continue
    }

    // Check closing bracket
    if (input.charCodeAt(k) === 93 && indent <= arrayIndent) {
      if (maxArraySize > 0 && maxArraySize !== Infinity && items.length > maxArraySize) {
        throw new ParseError(
          `Array exceeds maximum size of ${maxArraySize}`,
          lineIndex,
          line,
          indent
        )
      }
      return {
        value: items.map(item => parseValueWithOptions(item)),
        pos: lineEnd + 1,
        lineIndex: lineIndex + 1,
      }
    }

    if (indent <= arrayIndent) {
      throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex, line, indent)
    }

    const itemContent = input.slice(k, lineEnd).trim()

    // Block string in array
    if (itemContent === '"""') {
      const result = parseBlockStringInArray(input, lineEnd + 1, indent, len)
      items.push(result.value)
      pos = result.pos
      lineIndex = result.lineIndex
      continue
    }

    // Regular item
    let cleaned = itemContent
    if (cleaned.endsWith(',')) cleaned = cleaned.slice(0, -1).trim()
    if (cleaned.length > 0) items.push(cleaned)

    pos = lineEnd + 1
    lineIndex++
  }

  throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex - 1, lastLine)
}

export const parseArrayItems = (
  token: string,
  valueParser: ValueParser,
  maxArraySize: number,
  lineNumber?: number,
  line?: string,
  columnOffset?: number
): NodeValue[] => {
  const root: NodeValue[] = []
  const stack: NodeValue[][] = [root]

  const checkSize = (arr: NodeValue[]): void => {
    if (maxArraySize > 0 && maxArraySize !== Infinity && arr.length > maxArraySize) {
      throw new ParseError(`Array exceeds maximum size of ${maxArraySize}`, lineNumber, line)
    }
  }

  let i = 0
  let start = 0
  const len = token.length
  let inString = false
  let stringChar = -1

  while (i < len) {
    const char = token.charCodeAt(i)

    if (!inString) {
      if (char === 91) { // [
        const preRaw = token.slice(start, i)
        const pre = preRaw.trim()
        if (pre.length > 0) {
          const leadingSpaces = preRaw.length - preRaw.trimStart().length
          const columnNumber = columnOffset !== undefined ? columnOffset + start + leadingSpaces : undefined
          stack[stack.length - 1].push(valueParser(pre, lineNumber, line, columnNumber))
          checkSize(stack[stack.length - 1])
        }
        const newArr: NodeValue[] = []
        stack[stack.length - 1].push(newArr)
        checkSize(stack[stack.length - 1])
        stack.push(newArr)
        start = i + 1
      } else if (char === 93) { // ]
        const valRaw = token.slice(start, i)
        const val = valRaw.trim()
        if (val.length > 0) {
          const leadingSpaces = valRaw.length - valRaw.trimStart().length
          const columnNumber = columnOffset !== undefined ? columnOffset + start + leadingSpaces : undefined
          stack[stack.length - 1].push(valueParser(val, lineNumber, line, columnNumber))
          checkSize(stack[stack.length - 1])
        }
        if (stack.length === 1) {
          const columnNumber = columnOffset !== undefined ? columnOffset + i : undefined
          throw new ParseError('Unexpected closing bracket "]" in array', lineNumber, line, columnNumber)
        }
        stack.pop()
        start = i + 1
      } else if (char === 44) { // ,
        const valRaw = token.slice(start, i)
        const val = valRaw.trim()
        if (val.length > 0) {
          const leadingSpaces = valRaw.length - valRaw.trimStart().length
          const columnNumber = columnOffset !== undefined ? columnOffset + start + leadingSpaces : undefined
          stack[stack.length - 1].push(valueParser(val, lineNumber, line, columnNumber))
          checkSize(stack[stack.length - 1])
        }
        start = i + 1
      } else if (char === 34 || char === 39) {
        inString = true
        stringChar = char
      }
    } else if (char === stringChar && token.charCodeAt(i - 1) !== 92) {
      inString = false
      stringChar = -1
    }
    i++
  }

  if (inString) {
    const columnNumber = columnOffset !== undefined ? columnOffset + i : undefined
    throw new ParseError('Unclosed string in array', lineNumber, line, columnNumber)
  }

  const valRaw = token.slice(start)
  const val = valRaw.trim()
  if (val.length > 0) {
    const leadingSpaces = valRaw.length - valRaw.trimStart().length
    const columnNumber = columnOffset !== undefined ? columnOffset + start + leadingSpaces : undefined
    stack[stack.length - 1].push(valueParser(val, lineNumber, line, columnNumber))
    checkSize(stack[stack.length - 1])
  }

  if (stack.length > 1) {
    const columnNumber = columnOffset !== undefined ? columnOffset + len : undefined
    throw new ParseError('Unclosed array: missing closing bracket "]"', lineNumber, line, columnNumber)
  }

  return root
}

// ─────────────────────────────────────────────────────────────────────────────
// Block String Parsing
// ─────────────────────────────────────────────────────────────────────────────

export const parseBlockString = (
  input: string,
  startPos: number,
  baseIndent: number,
  len: number
): BlockStringResult => {
  const lines: string[] = []
  let blockIndent: number | null = null
  let pos = startPos
  let lineIndex = 0

  while (pos < len) {
    let lineEnd = input.indexOf('\n', pos)
    if (lineEnd === -1) lineEnd = len

    let indent = 0
    let m = pos
    while (m < lineEnd && input.charCodeAt(m) === 32) {
      indent++
      m++
    }

    // Empty line
    if (m === lineEnd) {
      if (blockIndent !== null) lines.push('')
      pos = lineEnd + 1
      lineIndex++
      continue
    }

    // Closing """
    if (indent <= baseIndent && lineEnd - m === 3 && input.slice(m, lineEnd) === '"""') {
      return { value: lines.join('\n'), pos: lineEnd + 1, lineIndex: lineIndex + 1 }
    }

    blockIndent ??= indent
    lines.push(indent >= blockIndent ? input.slice(pos + blockIndent, lineEnd) : input.slice(m, lineEnd))

    pos = lineEnd + 1
    lineIndex++
  }

  return { value: lines.join('\n'), pos, lineIndex }
}

export const parseBlockStringInArray = (
  input: string,
  startPos: number,
  baseIndent: number,
  len: number
): BlockStringResult => {
  const lines: string[] = []
  let blockIndent: number | null = null
  let pos = startPos
  let lineIndex = 0

  while (pos < len) {
    let lineEnd = input.indexOf('\n', pos)
    if (lineEnd === -1) lineEnd = len

    let indent = 0
    let m = pos
    while (m < lineEnd && input.charCodeAt(m) === 32) {
      indent++
      m++
    }

    // Closing """
    if (indent <= baseIndent && lineEnd - m === 3 && input.slice(m, lineEnd) === '"""') {
      return { value: lines.join('\n'), pos: lineEnd + 1, lineIndex: lineIndex + 1 }
    }

    if (m === lineEnd) {
      if (blockIndent !== null) lines.push('')
    } else {
      blockIndent ??= indent
      lines.push(indent >= blockIndent ? input.slice(pos + blockIndent, lineEnd) : input.slice(m, lineEnd))
    }

    pos = lineEnd + 1
    lineIndex++
  }

  return { value: lines.join('\n'), pos, lineIndex }
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Parsing
// ─────────────────────────────────────────────────────────────────────────────

// Forward declaration for circular dependency with parse
let parseFunction: (<T>(input: string, options?: ParseOptions) => T) | null = null

/** Sets the parse function reference (called from parse.ts to resolve circular dependency). */
export const setParseFunction = (fn: <T>(input: string, options?: ParseOptions) => T): void => {
  parseFunction = fn
}

export const parseValue = (token: string, options?: ParseOptions, lineNumber?: number, line?: string, columnNumber?: number): NodeValue => {
  // Literals
  if (token === 'null') return null
  if (token === 'undefined') return undefined
  if (token === 'true') return true
  if (token === 'false') return false

  // Import
  if (token.startsWith('@')) {
    return parseImport(token, options, lineNumber, line, columnNumber)
  }

  const firstChar = token.charCodeAt(0)

  // Number
  if ((firstChar >= 48 && firstChar <= 57) || firstChar === 45 || firstChar === 43) {
    const num = Number(token)
    if (!Number.isNaN(num)) return num
  }

  // Date
  if (firstChar >= 48 && firstChar <= 57 && token.length >= 10 && token[4] === '-') {
    const d = new Date(token)
    if (!Number.isNaN(d.getTime())) return d
  }

  // Quoted string
  if ((firstChar === 34 && token.endsWith('"')) || (firstChar === 39 && token.endsWith("'"))) {
    const inner = token.slice(1, -1)
    if (!inner.includes('\\')) return inner

    return inner.replace(/\\(["'nrt\\])/g, (_, ch) => {
      switch (ch) {
        case 'n': return '\n'
        case 'r': return '\r'
        case 't': return '\t'
        case '"': return '"'
        case "'": return "'"
        case '\\': return '\\'
        default: return ch as string
      }
    })
  }

  return token
}

const isBrowserEnvironment = (): boolean => {
  if (typeof globalThis !== 'object') return false
  return 'document' in globalThis
}

const parseImport = (token: string, options?: ParseOptions, lineNumber?: number, line?: string, columnNumber?: number): NodeValue => {
  if (isBrowserEnvironment()) {
    throw new ParseError('File imports (@) are not available in browser environments', lineNumber, line, columnNumber)
  }
  if (parseFunction === null) {
    throw new ParseError('Parser not initialized', lineNumber, line, columnNumber)
  }

  const maxImportDepth = options?.maxImportDepth ?? DEFAULT_MAX_IMPORT_DEPTH
  const currentImportDepth = options?._importDepth ?? 0

  if (maxImportDepth > 0 && maxImportDepth !== Infinity && currentImportDepth >= maxImportDepth) {
    throw new ParseError(`Maximum import depth of ${maxImportDepth} exceeded`, lineNumber, line, columnNumber)
  }

  let isUnwrap = false
  let importPath = token.slice(1)

  if (importPath.startsWith('@')) {
    isUnwrap = true
    importPath = importPath.slice(1)
  }

  // Remove quotes
  if ((importPath.startsWith('"') && importPath.endsWith('"')) ||
      (importPath.startsWith("'") && importPath.endsWith("'"))) {
    importPath = importPath.slice(1, -1)
  }

  const baseDir = options?.baseDir ?? process.cwd()
  const absolutePath = path.resolve(baseDir, importPath)

  if (options?._sandboxDir != null && options._sandboxDir !== '') {
    validatePathSandbox(absolutePath, options._sandboxDir)
  }

  if (options?._ancestors?.has(absolutePath) === true) {
    throw new ParseError(`Circular dependency detected: "${absolutePath}"`, lineNumber, line, columnNumber)
  }

  // Check cache first
  const cache = options?._importCache
  let parsed = cache?.get(absolutePath)

  if (parsed === undefined) {
    try {
      const content = fs.readFileSync(absolutePath, 'utf-8')
      const newAncestors = new Set(options?._ancestors ?? [])
      newAncestors.add(absolutePath)

      parsed = parseFunction<NodeValue>(content, {
        baseDir: path.dirname(absolutePath),
        maxDepth: options?.maxDepth,
        maxArraySize: options?.maxArraySize,
        maxImportDepth: options?.maxImportDepth,
        _ancestors: newAncestors,
        _importDepth: currentImportDepth + 1,
        _sandboxDir: options?._sandboxDir,
        _importCache: cache,
      })

      // Store in cache for reuse
      cache?.set(absolutePath, parsed)
    } catch (error) {
      if (error instanceof ParseError) throw error
      throw new ParseError(`Failed to import file "${importPath}": ${(error as Error).message}`, lineNumber, line, columnNumber)
    }
  }

  if (isUnwrap) {
    const keys = Object.keys(parsed as object)
    if (keys.length !== 1) {
      throw new ParseError(`Imported file must have exactly one root key to use "@@" syntax, found ${keys.length} keys`, lineNumber, line, columnNumber)
    }
    const value = (parsed as Record<string, unknown>)[keys[0]]
    if (!Array.isArray(value)) {
      throw new ParseError(`Imported file's root key "${keys[0]}" must be an array to use "@@" syntax`, lineNumber, line, columnNumber)
    }
    return value
  }

  return parsed
}

