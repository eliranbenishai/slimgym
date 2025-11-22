import { ParseError, type NodeObject, type NodeValue } from './types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createParsedConfig = <T = any>(data: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertToJSON = (value: any): any => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (Array.isArray(value)) {
      return value.map(convertToJSON)
    }
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = {}
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          result[key] = convertToJSON(value[key])
        }
      }
      return result
    }
    return value
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toJSON = (): any => convertToJSON(data)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(data as any, {
    get: (target, prop) => {
      if (prop === 'toJSON') {
        return toJSON
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parse = <T = any>(input: string): T => {
  if (typeof input !== 'string') {
    throw new ParseError('Input must be a string')
  }

  const len = input.length
  let pos = 0
  let lineStart = 0
  let lineIndex = 0

  const root: NodeObject = {}
  // Stack stores { indent, obj }
  // We use a fixed size array or just push/pop. 
  // Pre-allocating stack might be overkill but let's keep it simple.
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }]

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
      // Comment
      lineIndex++
      pos = lineEnd + 1
      lineStart = pos
      continue
    }

    // 3. Parse Key
    // Key is [a-zA-Z0-9_-]+
    const keyStart = i
    while (i < lineEnd) {
      const code = input.charCodeAt(i)
      // Check for space (32) or newline (shouldn't happen here)
      if (code === 32) break
      i++
    }

    const key = input.slice(keyStart, i)

    // Validate key (fast check)
    // If we want to be strict: /^[a-zA-Z0-9_-]+$/
    // But we just scanned until space. Let's do a quick check if needed or trust the scanner.
    // The scanner stopped at space. We should check if we hit something invalid before space?
    // For performance, let's assume if it stopped at space it's the key, 
    // but we should check if the key is valid if we want to maintain strictness.
    // Let's do a quick regex check only if we suspect invalid chars, or just check the char codes in the loop above.
    // Re-implementing key scan with validation:
    /*
    let k = keyStart
    while (k < i) {
      const c = input.charCodeAt(k)
      if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95 || c === 45)) {
         throw new ParseError(...)
      }
      k++
    }
    */
    // For now, let's stick to the previous logic's strictness but maybe optimize later. 
    // The previous logic used regex `^[a-zA-Z0-9_-]+`.
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      // It might be that we didn't find a space and took the whole line, 
      // or the key contains invalid chars.
      // If the line was just "key", i would be lineEnd.
      // If "key:", invalid.
      throw new ParseError(`Invalid key format: "${key}"`, lineIndex, input.slice(lineStart, lineEnd))
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
        // Array start
        // Check if it's a multi-line array or inline
        // Scan for ] on the same line
        // Scan for the last ] on the line to handle nested arrays
        let hasClosing = false
        let j = lineEnd - 1
        while (j > i) {
          if (input.charCodeAt(j) === 93) { // ]
            hasClosing = true
            break
          }
          j--
        }

        if (hasClosing) {
          // Inline array
          const arrayContent = input.slice(i + 1, j)
          if (arrayContent.trim().length === 0) {
            // Empty array
            value = []
          } else {
            // Parse inline array items
            value = parseArrayItems(arrayContent, lineIndex, input.slice(lineStart, lineEnd))
          }
          pos = lineEnd + 1
          lineIndex++
          lineStart = pos
        } else {
          // Multi-line array
          // We need to consume lines until we find the closing bracket at the same indent
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
            if (k === alEnd || input.charCodeAt(k) === 35) {
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
              // Dedent without closing bracket -> error or implicit close?
              // Previous logic implies we break and let the outer loop handle it? 
              // No, arrays must be closed.
              // But wait, "If indent is less than or equal to array indent and not empty, we're done" 
              // was in the previous logic, but then it threw "Unclosed array".
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
                  if (blockIndent === null) blockIndent = blIndent

                  if (blIndent >= blockIndent) {
                    blockLines.push(input.slice(arrayPos + blockIndent, blEnd))
                  } else {
                    // Should not happen if valid block string logic, but just take what we have
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
            // If we broke out of loop without finding closing, it's an error
            // We need to be careful about where we left 'pos'
            if (pos <= lineEnd) { // We didn't update pos yet
              throw new ParseError('Unclosed array: missing closing bracket "]"', lineIndex, input.slice(lineStart, lineEnd))
            }
          } else {
            // We successfully parsed the array
            // Now we need to parse the values in arrayItems
            value = arrayItems.map(item => parseValue(item))

            // We already updated pos, lineStart, lineIndex in the loop when foundClosing
            // So we need to continue the outer loop immediately
            // But we still need to attach the value to the parent
            // So we don't 'continue' here, we just fall through to attachment logic
            // But we must ensure we don't process the current line again
            // The outer loop increments are done at start of iteration or we manage them manually.
            // My outer loop structure is `while (pos < len)`.
            // I calculate lineEnd at start.
            // So if I updated pos, I should be good for next iteration.
            // BUT, I need to finish processing THIS key-value pair first.
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

          if (blockIndent === null) blockIndent = blIndent

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
        // We have advanced pos, so we are ready for next iteration
        // But we need to attach value first
      } else {
        // Simple value
        // We need to handle quoted strings that might contain spaces
        // Or unquoted strings
        const rest = input.slice(i, lineEnd).trim()
        value = parseValue(rest)

        // Advance pointers
        pos = lineEnd + 1
        lineIndex++
        lineStart = pos
      }
    }

    // 5. Attach to parent
    // Adjust stack based on indent
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
      parent[key] = value
    }

    // If value is object, push to stack
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      stack.push({ indent, obj: value })
    }
  }

  return createParsedConfig<T>(root as T)
}

const parseArrayItems = (token: string, lineNumber?: number, line?: string): NodeValue[] => {
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
          stack[stack.length - 1].push(parseValue(pre))
        }

        const newArr: NodeValue[] = []
        stack[stack.length - 1].push(newArr)
        stack.push(newArr)
        start = i + 1
      } else if (char === 93) { // ]
        // Handle pending value
        const val = token.slice(start, i).trim()
        if (val.length > 0) {
          stack[stack.length - 1].push(parseValue(val))
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
          stack[stack.length - 1].push(parseValue(val))
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
    stack[stack.length - 1].push(parseValue(val))
  }

  if (stack.length > 1) {
    throw new ParseError('Unclosed array: missing closing bracket "]"', lineNumber, line)
  }

  return root
}

const parseValue = (token: string): NodeValue => {
  if (token === 'null') return null
  if (token === 'undefined') return undefined
  if (token === 'true') return true
  if (token === 'false') return false

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
    if (inner.indexOf('\\') === -1) return inner

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

const isPlainObject = (v: unknown): v is NodeObject => {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}
