import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import { ParseError, type NodeObject, type NodeValue } from './types.js'

// Security: Keys that could cause prototype pollution or override built-ins
const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  // Object.prototype methods (prevent overriding runtime behavior)
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

// Default security limits
const DEFAULT_MAX_DEPTH = 100
const DEFAULT_MAX_ARRAY_SIZE = 10000
const DEFAULT_MAX_IMPORT_DEPTH = 10

export interface ParseOptions {
  baseDir?: string
  /**
   * Maximum nesting depth for objects. Defaults to 100.
   * Set to 0 or Infinity to disable.
   */
  maxDepth?: number
  /**
   * Maximum number of items in an array. Defaults to 10000.
   * Set to 0 or Infinity to disable.
   */
  maxArraySize?: number
  /**
   * Maximum depth of @import chains. Defaults to 10.
   * Set to 0 or Infinity to disable.
   */
  maxImportDepth?: number
  /** @internal */
  _ancestors?: Set<string>
  /** @internal */
  _currentDepth?: number
  /** @internal */
  _importDepth?: number
  /** @internal */
  _sandboxDir?: string
}

export interface FetchOptions {
  /**
   * Base directory for resolving relative paths.
   * Defaults to process.cwd() if not provided.
   */
  baseDir?: string
  /**
   * Restrict file access to this directory and its subdirectories.
   * Prevents path traversal attacks. If not set, no restriction is applied.
   */
  sandboxDir?: string
  /**
   * Maximum nesting depth for objects. Defaults to 100.
   */
  maxDepth?: number
  /**
   * Maximum number of items in an array. Defaults to 10000.
   */
  maxArraySize?: number
  /**
   * Maximum depth of @import chains. Defaults to 10.
   */
  maxImportDepth?: number
}

export interface FetchUrlOptions {
  /**
   * Base URL for resolving relative imports within the fetched content.
   * If not provided, uses the URL's base path.
   */
  baseUrl?: string
  /**
   * List of allowed hostnames. If provided, only URLs matching these hosts are allowed.
   * Prevents SSRF attacks.
   * @example ['example.com', 'cdn.example.com']
   */
  allowedHosts?: string[]
  /**
   * Maximum nesting depth for objects. Defaults to 100.
   */
  maxDepth?: number
  /**
   * Maximum number of items in an array. Defaults to 10000.
   */
  maxArraySize?: number
  /**
   * Maximum depth of @import chains. Defaults to 10.
   */
  maxImportDepth?: number
}

/**
 * Validates that a resolved path is within the allowed sandbox directory.
 * Prevents path traversal attacks.
 */
const validatePathSandbox = (absolutePath: string, sandboxDir: string): void => {
  const normalizedPath = path.normalize(absolutePath)
  const normalizedSandbox = path.normalize(sandboxDir)
  
  if (!normalizedPath.startsWith(normalizedSandbox + path.sep) && normalizedPath !== normalizedSandbox) {
    throw new ParseError(`Path traversal detected: "${absolutePath}" is outside sandbox "${sandboxDir}"`)
  }
}

/**
 * Validates that a URL's host is in the allowed list.
 * Prevents SSRF attacks.
 */
const validateUrlHost = (url: string, allowedHosts: string[]): void => {
  const parsedUrl = new URL(url)
  const host = parsedUrl.hostname.toLowerCase()
  
  const isAllowed = allowedHosts.some(allowed => {
    const normalizedAllowed = allowed.toLowerCase()
    return host === normalizedAllowed || host.endsWith(`.${normalizedAllowed}`)
  })
  
  if (!isAllowed) {
    throw new ParseError(`Host "${host}" is not in the allowed hosts list`)
  }
}

/**
 * Reads and parses a SlimGym file from the filesystem.
 * Supports both absolute and relative paths.
 *
 * @param filePath - The path to the file (can be relative or absolute)
 * @param options - Options for resolving the file path
 * @returns The parsed content
 * @throws ParseError if the file cannot be read or parsed
 */
export const fetch = <T = any>(filePath: string, options?: FetchOptions): T => {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new ParseError('File path must be a non-empty string')
  }

  const baseDir = options?.baseDir ?? process.cwd()
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(baseDir, filePath)

  // Security: Validate path is within sandbox if specified
  if (options?.sandboxDir != null && options.sandboxDir !== '') {
    validatePathSandbox(absolutePath, options.sandboxDir)
  }

  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf-8')

    // Parse with baseDir set to the file's directory for proper relative import resolution
    return parse<T>(fileContent, {
      baseDir: path.dirname(absolutePath),
      maxDepth: options?.maxDepth,
      maxArraySize: options?.maxArraySize,
      maxImportDepth: options?.maxImportDepth,
      _sandboxDir: options?.sandboxDir,
    } as ParseOptions & { _sandboxDir?: string })
  } catch (error: any) {
    if (error instanceof ParseError) {
      throw error
    }
    if (error.code === 'ENOENT') {
      throw new ParseError(`File not found: "${absolutePath}"`)
    }
    if (error.code === 'EACCES') {
      throw new ParseError(`Permission denied: "${absolutePath}"`)
    }
    if (error.code === 'EISDIR') {
      throw new ParseError(`Path is a directory, not a file: "${absolutePath}"`)
    }
    throw new ParseError(`Failed to read file "${absolutePath}": ${error.message}`)
  }
}

/**
 * Asynchronously reads and parses a SlimGym file from the filesystem.
 * Supports both absolute and relative paths.
 *
 * @param filePath - The path to the file (can be relative or absolute)
 * @param options - Options for resolving the file path
 * @returns Promise resolving to the parsed content
 * @throws ParseError if the file cannot be read or parsed
 */
export const fetchAsync = async <T = any>(filePath: string, options?: FetchOptions): Promise<T> => {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new ParseError('File path must be a non-empty string')
  }

  const baseDir = options?.baseDir ?? process.cwd()
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(baseDir, filePath)

  // Security: Validate path is within sandbox if specified
  if (options?.sandboxDir != null && options.sandboxDir !== '') {
    validatePathSandbox(absolutePath, options.sandboxDir)
  }

  try {
    const fileContent = await fsPromises.readFile(absolutePath, 'utf-8')

    // Parse with baseDir set to the file's directory for proper relative import resolution
    return parse<T>(fileContent, {
      baseDir: path.dirname(absolutePath),
      maxDepth: options?.maxDepth,
      maxArraySize: options?.maxArraySize,
      maxImportDepth: options?.maxImportDepth,
      _sandboxDir: options?.sandboxDir,
    } as ParseOptions & { _sandboxDir?: string })
  } catch (error: any) {
    if (error instanceof ParseError) {
      throw error
    }
    if (error.code === 'ENOENT') {
      throw new ParseError(`File not found: "${absolutePath}"`)
    }
    if (error.code === 'EACCES') {
      throw new ParseError(`Permission denied: "${absolutePath}"`)
    }
    if (error.code === 'EISDIR') {
      throw new ParseError(`Path is a directory, not a file: "${absolutePath}"`)
    }
    throw new ParseError(`Failed to read file "${absolutePath}": ${error.message}`)
  }
}

/**
 * Fetches and parses a SlimGym file from a URL using Node's native fetch.
 *
 * @param url - The URL to fetch the SlimGym content from
 * @param options - Options for parsing the content
 * @returns Promise resolving to the parsed content
 * @throws ParseError if the fetch fails or content is invalid
 */
export const fetchUrl = async <T = any>(url: string, options?: FetchUrlOptions): Promise<T> => {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new ParseError('URL must be a non-empty string')
  }

  // Security: Validate URL host if allowedHosts is specified
  if (options?.allowedHosts && options.allowedHosts.length > 0) {
    validateUrlHost(url, options.allowedHosts)
  }

  try {
    const response = await globalThis.fetch(url)

    if (!response.ok) {
      throw new ParseError(`Failed to fetch "${url}": ${response.status} ${response.statusText}`)
    }

    const content = await response.text()

    // If baseUrl is provided, use it for resolving relative imports
    // Otherwise, use the URL's base path
    const baseUrl = options?.baseUrl ?? new URL('.', url).href

    return parse<T>(content, {
      baseDir: baseUrl,
      maxDepth: options?.maxDepth,
      maxArraySize: options?.maxArraySize,
      maxImportDepth: options?.maxImportDepth,
    })
  } catch (error: any) {
    if (error instanceof ParseError) {
      throw error
    }
    throw new ParseError(`Failed to fetch "${url}": ${error.message}`)
  }
}

export interface FindOptions {
  /**
   * Maximum depth to search. Defaults to Infinity.
   */
  depth?: number
}

const createParsedConfig = <T = any>(data: T): T => {
  // Pattern matching for $find queries
  const matchPattern = (key: string, pattern: string): boolean => {
    if (pattern === '*') return true
    if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
      // *contains*
      return key.includes(pattern.slice(1, -1))
    }
    if (pattern.startsWith('*')) {
      // *endsWith
      return key.endsWith(pattern.slice(1))
    }
    if (pattern.endsWith('*')) {
      // startsWith*
      return key.startsWith(pattern.slice(0, -1))
    }
    // exact match
    return key === pattern
  }

  const hasWildcard = (pattern: string): boolean => pattern.includes('*')

  const $find = (query: string, options?: FindOptions): any => {
    const maxDepth = options?.depth ?? Infinity
    const segments = query.split('.')

    const findMatch = (
      obj: any,
      segmentIndex: number,
      currentDepth: number
    ): any => {
      // All segments matched - return the value (even primitives)
      if (segmentIndex >= segments.length) return obj

      // Base cases for continuing the search
      if (currentDepth > maxDepth) return undefined
      if (obj === null || typeof obj !== 'object') return undefined

      const pattern = segments[segmentIndex]

      // Handle arrays - search each element
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const result = findMatch(item, segmentIndex, currentDepth)
          if (result !== undefined) return result
        }
        return undefined
      }

      if (hasWildcard(pattern)) {
        // Search current level first
        for (const key of Object.keys(obj)) {
          if (matchPattern(key, pattern)) {
            const result = findMatch(obj[key], segmentIndex + 1, currentDepth + 1)
            if (result !== undefined) return result
          }
        }

        // Then search deeper (wildcard patterns search at any depth)
        for (const key of Object.keys(obj)) {
          const child = obj[key]
          if (child !== null && typeof child === 'object') {
            const result = findMatch(child, segmentIndex, currentDepth + 1)
            if (result !== undefined) return result
          }
        }
      } else {
        // Exact match at current level only
        if (Object.prototype.hasOwnProperty.call(obj, pattern)) {
          return findMatch(obj[pattern], segmentIndex + 1, currentDepth + 1)
        }
      }

      return undefined
    }

    return findMatch(data, 0, 0)
  }

  // High-performance deep clone using iterative approach with stack
  const deepClone = (value: any): any => {
    // Fast path for primitives
    if (value === null || value === undefined) return value
    const type = typeof value
    if (type !== 'object') return value

    // Date special case
    if (value instanceof Date) {
      return new Date(value.getTime())
    }

    // Use iterative approach with explicit stack for better performance
    const root = Array.isArray(value) ? [] : {}
    const stack: { src: any; dst: any; keys: string[]; idx: number }[] = [{
      src: value,
      dst: root,
      keys: Object.keys(value),
      idx: 0,
    }]

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]

      if (frame.idx >= frame.keys.length) {
        stack.pop()
        continue
      }

      const key = frame.keys[frame.idx++]
      const srcVal = frame.src[key]

      // Fast path for primitives (null, undefined, string, number, boolean)
      if (srcVal === null || srcVal === undefined) {
        frame.dst[key] = srcVal
        continue
      }

      const valType = typeof srcVal
      if (valType !== 'object') {
        frame.dst[key] = srcVal
        continue
      }

      // Date
      if (srcVal instanceof Date) {
        frame.dst[key] = new Date(srcVal.getTime())
        continue
      }

      // Array or Object - push new frame
      const cloned = Array.isArray(srcVal) ? [] : {}
      frame.dst[key] = cloned
      stack.push({
        src: srcVal,
        dst: cloned,
        keys: Object.keys(srcVal),
        idx: 0,
      })
    }

    return root
  }

  const $clone = (): T => deepClone(data)

  return new Proxy(data as any, {
    get: (target, prop) => {
      if (prop === '$find') {
        return $find
      }
      if (prop === '$clone') {
        return $clone
      }
      return target[prop as keyof typeof target]
    },
    has: (target, prop) => {
      if (prop === '$find' || prop === '$clone') {
        return true
      }
      return prop in target
    },
    ownKeys: (target) => {
      return Object.keys(target)
    },
    getOwnPropertyDescriptor: (target, prop) => {
      if (prop === '$find') {
        return {
          enumerable: false,
          configurable: true,
          value: $find,
          writable: false,
        }
      }
      if (prop === '$clone') {
        return {
          enumerable: false,
          configurable: true,
          value: $clone,
          writable: false,
        }
      }
      return Object.getOwnPropertyDescriptor(target, prop)
    },
  }) as T
}

export const parse = <T = any>(input: string, options?: ParseOptions): T => {
  if (typeof input !== 'string') {
    throw new ParseError('Input must be a string')
  }

  // Security limits
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxArraySize = options?.maxArraySize ?? DEFAULT_MAX_ARRAY_SIZE

  const len = input.length
  let pos = 0
  let lineStart = 0
  let lineIndex = 0

  const root: NodeObject = {}
  // Stack stores { indent, obj }
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }]

  // Helper to parse values with options
  const parseValueWithOptions = (token: string, lineNumber?: number, line?: string): NodeValue => {
    return parseValue(token, options, lineNumber, line)
  }

  while (pos < len) {
    // Find end of line
    let lineEnd = input.indexOf('\n', pos)
    if (lineEnd === -1) lineEnd = len

    // Process line
    // 1. Calculate indent
    let indent = 0
    let i = lineStart
    while (i < lineEnd && input.charCodeAt(i) === 32) { // 32 is space
      indent++
      i++
    }

    // 2. Check if empty or comment
    if (i === lineEnd) {
      // Empty line
      lineIndex++
      pos = lineEnd + 1
      lineStart = pos
      continue
    }

    const firstChar = input.charCodeAt(i)
    if (firstChar === 35) { // # is 35
      // Check if it's a comment (must be followed by space or newline)
      if (i + 1 === lineEnd || input.charCodeAt(i + 1) === 32) {
        // Comment
        lineIndex++
        pos = lineEnd + 1
        lineStart = pos
        continue
      }
    }

    // 3. Parse Key
    const keyStart = i
    while (i < lineEnd) {
      const code = input.charCodeAt(i)
      if (code === 32) break
      i++
    }

    let key = input.slice(keyStart, i)
    let forceArray = false

    // Check for [] prefix
    if (key.startsWith('[]')) {
      forceArray = true
      key = key.slice(2)
    }

    // Validate key (fast check)
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new ParseError(`Invalid key format: "${input.slice(keyStart, i)}"`, lineIndex, input.slice(lineStart, lineEnd))
    }

    // Security: Block prototype pollution
    if (DANGEROUS_KEYS.has(key)) {
      throw new ParseError(`Forbidden key "${key}" (potential prototype pollution)`, lineIndex, input.slice(lineStart, lineEnd))
    }

    // 4. Parse Value
    // Skip spaces after key
    while (i < lineEnd && input.charCodeAt(i) === 32) i++

    let value: NodeValue

    if (i === lineEnd) {
      // No value -> Empty object
      value = {}
      pos = lineEnd + 1
      lineIndex++
      lineStart = pos
    } else {
      const char = input.charCodeAt(i)

      if (char === 91) { // [
        let hasClosing = false
        let j = lineEnd - 1
        while (j > i) {
          if (input.charCodeAt(j) === 93) {
            hasClosing = true
            break
          }
          j--
        }

        if (hasClosing) {
          const arrayContent = input.slice(i + 1, j)
          if (arrayContent.trim().length === 0) {
            value = []
          } else {
            value = parseArrayItems(arrayContent, parseValueWithOptions, maxArraySize, lineIndex, input.slice(lineStart, lineEnd))
          }
          pos = lineEnd + 1
          lineIndex++
          lineStart = pos
        } else {
          const arrayItems: string[] = []
          const arrayIndent = indent
          let arrayLineIndex = lineIndex + 1
          let arrayPos = lineEnd + 1
          let foundClosing = false

          while (arrayPos < len) {
            let alEnd = input.indexOf('\n', arrayPos)
            if (alEnd === -1) alEnd = len

            // Check indent
            let alIndent = 0
            let k = arrayPos
            while (k < alEnd && input.charCodeAt(k) === 32) {
              alIndent++
              k++
            }

            // Skip blank/comment
            if (k === alEnd || (input.charCodeAt(k) === 35 && (k + 1 === alEnd || input.charCodeAt(k + 1) === 32))) {
              arrayPos = alEnd + 1
              arrayLineIndex++
              continue
            }

            // Check closing bracket
            if (input.charCodeAt(k) === 93 && alIndent <= arrayIndent) { // ]
              foundClosing = true
              // Update main loop state
              pos = alEnd + 1
              lineStart = pos
              lineIndex = arrayLineIndex + 1
              break
            }

            if (alIndent <= arrayIndent) {
              break
            }

            // Process array item
            const itemContent = input.slice(k, alEnd).trim()

            // Check for block string in array
            if (itemContent === '"""') {
              // Block string in array
              const blockLines: string[] = []
              let blockIndent: number | null = null

              arrayPos = alEnd + 1
              arrayLineIndex++

              while (arrayPos < len) {
                let blEnd = input.indexOf('\n', arrayPos)
                if (blEnd === -1) blEnd = len

                let blIndent = 0
                let m = arrayPos
                while (m < blEnd && input.charCodeAt(m) === 32) {
                  blIndent++
                  m++
                }

                // Check closing """
                if (blIndent <= alIndent &&
                  blEnd - m === 3 &&
                  input.slice(m, blEnd) === '"""') {
                  arrayPos = blEnd + 1
                  arrayLineIndex++
                  break
                }

                // Handle content
                if (m === blEnd) {
                  // Empty line
                  if (blockIndent !== null) blockLines.push('')
                } else {
                  blockIndent ??= blIndent

                  if (blIndent >= blockIndent) {
                    blockLines.push(input.slice(arrayPos + blockIndent, blEnd))
                  } else {
                    blockLines.push(input.slice(m, blEnd))
                  }
                }

                arrayPos = blEnd + 1
                arrayLineIndex++
              }
              arrayItems.push(blockLines.join('\n'))
              continue // Continue array loop
            }

            // Regular item
            // Remove trailing comma if present
            let cleaned = itemContent
            if (cleaned.endsWith(',')) cleaned = cleaned.slice(0, -1).trim()
            if (cleaned.length > 0) {
              arrayItems.push(cleaned)
            }

            arrayPos = alEnd + 1
            arrayLineIndex++
          }

          if (!foundClosing) {
            if (pos <= lineEnd) {
              throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex, input.slice(lineStart, lineEnd))
            }
          } else {
            // Security: Check array size limit
            if (maxArraySize > 0 && maxArraySize !== Infinity && arrayItems.length > maxArraySize) {
              throw new ParseError(`Array exceeds maximum size of ${maxArraySize}`, lineIndex, input.slice(lineStart, lineEnd))
            }
            value = arrayItems.map(item => parseValueWithOptions(item, lineIndex, input.slice(lineStart, lineEnd)))
          }
        }
      } else if (char === 34 && input.charCodeAt(i + 1) === 34 && input.charCodeAt(i + 2) === 34) { // """
        // Block string
        const blockLines: string[] = []
        let blockIndent: number | null = null

        // Advance to next line
        pos = lineEnd + 1
        lineIndex++
        lineStart = pos

        while (pos < len) {
          let blEnd = input.indexOf('\n', pos)
          if (blEnd === -1) blEnd = len

          let blIndent = 0
          let m = pos
          while (m < blEnd && input.charCodeAt(m) === 32) {
            blIndent++
            m++
          }

          // Check blank
          if (m === blEnd) {
            if (blockIndent !== null) blockLines.push('')
            pos = blEnd + 1
            lineIndex++
            lineStart = pos
            continue
          }

          // Check closing """
          if (blIndent <= indent &&
            blEnd - m === 3 &&
            input.slice(m, blEnd) === '"""') {
            pos = blEnd + 1
            lineIndex++
            lineStart = pos
            break
          }

          blockIndent ??= blIndent

          if (blIndent >= blockIndent) {
            blockLines.push(input.slice(pos + blockIndent, blEnd))
          } else {
            blockLines.push(input.slice(m, blEnd))
          }

          pos = blEnd + 1
          lineIndex++
          lineStart = pos
        }
        value = blockLines.join('\n')
      } else {
        // Simple value
        const rest = input.slice(i, lineEnd).trim()
        value = parseValueWithOptions(rest, lineIndex, input.slice(lineStart, lineEnd))

        // Advance pointers
        pos = lineEnd + 1
        lineIndex++
        lineStart = pos
      }
    }

    // 5. Attach to parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1].obj

    // Handle repeated keys
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      const existing = parent[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        parent[key] = [existing, value]
      }
    } else {
      if (forceArray) {
        parent[key] = [value]
      } else {
        parent[key] = value
      }
    }

    // If value is object, push to stack
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Security: Check depth limit
      if (maxDepth > 0 && maxDepth !== Infinity && stack.length >= maxDepth) {
        throw new ParseError(`Maximum nesting depth of ${maxDepth} exceeded`, lineIndex, input.slice(lineStart, lineEnd))
      }
      stack.push({ indent, obj: value })
    }
  }

  return createParsedConfig<T>(root as T)
}

const parseArrayItems = (token: string, valueParser: (t: string, ln?: number, l?: string) => NodeValue, maxArraySize: number, lineNumber?: number, line?: string): NodeValue[] => {
  const root: NodeValue[] = []
  const stack: NodeValue[][] = [root]

  // Helper to check array size
  const checkArraySize = (arr: NodeValue[]): void => {
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
        // Check for pending value before [
        const pre = token.slice(start, i).trim()
        if (pre.length > 0) {
          stack[stack.length - 1].push(valueParser(pre, lineNumber, line))
          checkArraySize(stack[stack.length - 1])
        }

        const newArr: NodeValue[] = []
        stack[stack.length - 1].push(newArr)
        checkArraySize(stack[stack.length - 1])
        stack.push(newArr)
        start = i + 1
      } else if (char === 93) { // ]
        // Handle pending value
        const val = token.slice(start, i).trim()
        if (val.length > 0) {
          stack[stack.length - 1].push(valueParser(val, lineNumber, line))
          checkArraySize(stack[stack.length - 1])
        }

        if (stack.length === 1) {
          throw new ParseError('Unexpected closing bracket "]" in array', lineNumber, line)
        }
        stack.pop()
        start = i + 1
      } else if (char === 44) { // ,
        // Handle pending value
        const val = token.slice(start, i).trim()
        if (val.length > 0) {
          stack[stack.length - 1].push(valueParser(val, lineNumber, line))
          checkArraySize(stack[stack.length - 1])
        }
        start = i + 1
      } else if (char === 34 || char === 39) {
        inString = true
        stringChar = char
      }
    } else {
      if (char === stringChar && token.charCodeAt(i - 1) !== 92) {
        inString = false
        stringChar = -1
      }
    }
    i++
  }

  if (inString) {
    throw new ParseError('Unclosed string in array', lineNumber, line)
  }

  // Handle end of string
  const val = token.slice(start).trim()
  if (val.length > 0) {
    stack[stack.length - 1].push(valueParser(val, lineNumber, line))
    checkArraySize(stack[stack.length - 1])
  }

  if (stack.length > 1) {
    throw new ParseError('Unclosed array: missing closing bracket "]"', lineNumber, line)
  }

  return root
}

const parseValue = (token: string, options?: ParseOptions, lineNumber?: number, line?: string): NodeValue => {
  if (token === 'null') return null
  if (token === 'undefined') return undefined
  if (token === 'true') return true
  if (token === 'false') return false

  // Handle Import
  if (token.startsWith('@')) {
    // Security: Check import depth limit
    const maxImportDepth = options?.maxImportDepth ?? DEFAULT_MAX_IMPORT_DEPTH
    const currentImportDepth = options?._importDepth ?? 0
    if (maxImportDepth > 0 && maxImportDepth !== Infinity && currentImportDepth >= maxImportDepth) {
      throw new ParseError(`Maximum import depth of ${maxImportDepth} exceeded`, lineNumber, line)
    }

    let isUnwrap = false
    let importPath = token.slice(1)

    // Check for double @ (@@)
    if (importPath.startsWith('@')) {
      isUnwrap = true
      importPath = importPath.slice(1)
    }

    let cleanPath = importPath
    // Remove quotes if present
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) || (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
      cleanPath = cleanPath.slice(1, -1)
    }

    // Resolve path
    const baseDir = options?.baseDir ?? process.cwd()
    const absolutePath = path.resolve(baseDir, cleanPath)

    // Security: Validate path is within sandbox if specified
    if (options?._sandboxDir != null && options._sandboxDir !== '') {
      validatePathSandbox(absolutePath, options._sandboxDir)
    }

    // Check for circular reference
    if (options?._ancestors?.has(absolutePath) === true) {
      throw new ParseError(`Circular dependency detected: "${absolutePath}"`, lineNumber, line)
    }

    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf-8')

      // Update ancestors for recursive call
      const newAncestors = new Set(options?._ancestors ?? [])
      newAncestors.add(absolutePath)

      // Recursively parse the imported file
      const parsed = parse(fileContent, {
        baseDir: path.dirname(absolutePath),
        maxDepth: options?.maxDepth,
        maxArraySize: options?.maxArraySize,
        maxImportDepth: options?.maxImportDepth,
        _ancestors: newAncestors,
        _importDepth: currentImportDepth + 1,
        _sandboxDir: options?._sandboxDir,
      })

      if (isUnwrap) {
        // Check if it has exactly one key
        const keys = Object.keys(parsed)
        if (keys.length !== 1) {
          throw new Error(`Imported file must have exactly one root key to use "@@" syntax, found ${keys.length} keys`)
        }

        const value = parsed[keys[0]]
        if (!Array.isArray(value)) {
          throw new Error(`Imported file's root key "${keys[0]}" must be an array to use "@@" syntax`)
        }

        return value
      }

      return parsed
    } catch (error: any) {
      if (error instanceof ParseError) {
        throw error
      }
      throw new ParseError(`Failed to import file "${cleanPath}": ${error.message}`, lineNumber, line)
    }
  }

  const firstChar = token.charCodeAt(0)

  // Number
  // Check if it starts with digit or - or +
  if ((firstChar >= 48 && firstChar <= 57) || firstChar === 45 || firstChar === 43) {
    const num = Number(token)
    if (!Number.isNaN(num)) return num
  }

  // Date
  // 2025-01-01... starts with digit
  if (firstChar >= 48 && firstChar <= 57 && token.length >= 10 && token[4] === '-') {
    const d = new Date(token)
    if (!Number.isNaN(d.getTime())) return d
  }

  // Quoted string
  if ((firstChar === 34 && token.endsWith('"')) || (firstChar === 39 && token.endsWith("'"))) {
    const inner = token.slice(1, -1)
    // Fast unescape
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
