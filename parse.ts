import * as fs from 'node:fs'
import * as path from 'node:path'
import { ParseError, type NodeObject, type NodeValue } from './types.js'

export interface ParseOptions {
  baseDir?: string
}

const createParsedConfig = <T = any>(data: T): T => {
  const convertToJSON = (value: any): any => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (Array.isArray(value)) {
      return value.map(convertToJSON)
    }
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      const result: any = {}
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = convertToJSON(value[key])
        }
      }
      return result
    }
    return value
  }

  const toJSON = (): any => convertToJSON(data)

  return new Proxy(data as any, {
    get: (target, prop) => {
      if (prop === 'toJSON') {
        return toJSON
      }
      return target[prop as keyof typeof target]
    },
    has: (target, prop) => {
      if (prop === 'toJSON') {
        return true
      }
      return prop in target
    },
    ownKeys: (target) => {
      return Object.keys(target)
    },
    getOwnPropertyDescriptor: (target, prop) => {
      if (prop === 'toJSON') {
        return {
          enumerable: false,
          configurable: true,
          value: toJSON,
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
            value = parseArrayItems(arrayContent, parseValueWithOptions, lineIndex, input.slice(lineStart, lineEnd))
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
      stack.push({ indent, obj: value })
    }
  }

  return createParsedConfig<T>(root as T)
}

const parseArrayItems = (token: string, valueParser: (t: string, ln?: number, l?: string) => NodeValue, lineNumber?: number, line?: string): NodeValue[] => {
  const root: NodeValue[] = []
  const stack: NodeValue[][] = [root]

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
        }

        const newArr: NodeValue[] = []
        stack[stack.length - 1].push(newArr)
        stack.push(newArr)
        start = i + 1
      } else if (char === 93) { // ]
        // Handle pending value
        const val = token.slice(start, i).trim()
        if (val.length > 0) {
          stack[stack.length - 1].push(valueParser(val, lineNumber, line))
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
    const baseDir = options?.baseDir || process.cwd()
    const absolutePath = path.resolve(baseDir, cleanPath)

    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf-8')
      // Recursively parse the imported file
      const parsed = parse(fileContent, { baseDir: path.dirname(absolutePath) })

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
