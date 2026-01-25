/**
 * Wraps parsed data with utility methods ($find, $findAll, $clone, $freeze).
 * Methods use $ prefix to avoid conflicts with user data keys.
 */

import { ParseError } from './types.js'

export interface FindOptions {
  /**
   * Maximum depth to search. Defaults to Infinity.
   */
  depth?: number
}

export interface FindResult {
  key: string
  value: unknown
}

/**
 * Test if a pattern could match multiple keys (requires deep search).
 * Plain text patterns (no regex metacharacters) are treated as exact matches.
 * Patterns with regex metacharacters trigger deep searching.
 */
const needsDeepSearch = (pattern: string): boolean => {
  // If no regex metacharacters, it's an exact key name - no deep search needed
  return /[.+*?^${}()|[\]\\]/.test(pattern)
}

/**
 * Shared pattern matching for $find, $findAll, $findValue, $findAllValues.
 * Uses regex for matching.
 */
const matchPattern = (text: string, pattern: string): boolean => {
  try {
    const regex = new RegExp(pattern)
    return regex.test(text)
  } catch {
    // Invalid regex - fall back to exact match
    return text === pattern
  }
}

/**
 * Match a value against a regex pattern.
 * Values are converted to strings before matching.
 * Date objects are converted to ISO strings.
 */
const matchValue = (value: unknown, pattern: string): boolean => {
  if (value === null || value === undefined) return false

  // Handle Date objects specially - convert to ISO string
  if (value instanceof Date) {
    return matchPattern(value.toISOString(), pattern)
  }

  // Don't match other objects/arrays
  if (typeof value === 'object') return false

  const strValue = String(value)
  return matchPattern(strValue, pattern)
}

/**
 * Shared traversal logic for $find and $findAll.
 * Returns early for $find (single result), collects all for $findAll.
 */
const traverseFind = (
  data: unknown,
  segments: string[],
  maxDepth: number,
  collector: (path: string[], value: unknown) => boolean // return true to stop early
): void => {
  const traverse = (
    obj: unknown,
    segmentIndex: number,
    currentDepth: number,
    pathParts: string[]
  ): boolean => {
    // Depth exceeded
    if (currentDepth > maxDepth) return false

    // All segments matched
    if (segmentIndex >= segments.length) {
      return collector(pathParts, obj)
    }

    // Can't continue searching
    if (obj === null || typeof obj !== 'object') return false

    const pattern = segments[segmentIndex]

    // Handle arrays - search each element
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (traverse(obj[i], segmentIndex, currentDepth, [...pathParts, String(i)])) {
          return true
        }
      }
      return false
    }

    if (needsDeepSearch(pattern)) {
      // Search current level first
      for (const key of Object.keys(obj)) {
        if (matchPattern(key, pattern)) {
          if (traverse((obj as Record<string, unknown>)[key], segmentIndex + 1, currentDepth + 1, [...pathParts, key])) {
            return true
          }
        }
      }

      // Then search deeper (wildcard patterns search at any depth)
      for (const key of Object.keys(obj)) {
        const child = (obj as Record<string, unknown>)[key]
        if (child !== null && typeof child === 'object') {
          if (traverse(child, segmentIndex, currentDepth + 1, [...pathParts, key])) {
            return true
          }
        }
      }
    } else {
      // Exact match at current level only
      if (Object.prototype.hasOwnProperty.call(obj, pattern)) {
        return traverse((obj as Record<string, unknown>)[pattern], segmentIndex + 1, currentDepth + 1, [...pathParts, pattern])
      }
    }

    return false
  }

  traverse(data, 0, 0, [])
}

/**
 * Traversal logic for $findValue and $findAllValues.
 * Searches for values matching a pattern throughout the object graph.
 */
const traverseFindValue = (
  data: unknown,
  pattern: string,
  maxDepth: number,
  collector: (path: string[], value: unknown) => boolean // return true to stop early
): void => {
  const traverse = (
    obj: unknown,
    currentDepth: number,
    pathParts: string[]
  ): boolean => {
    // Depth exceeded
    if (currentDepth > maxDepth) return false

    // Check if current value matches
    if (matchValue(obj, pattern)) {
      return collector(pathParts, obj)
    }

    // Can't search deeper
    if (obj === null || typeof obj !== 'object') return false

    // Handle arrays
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (traverse(obj[i], currentDepth + 1, [...pathParts, String(i)])) {
          return true
        }
      }
      return false
    }

    // Handle objects
    for (const key of Object.keys(obj)) {
      if (traverse((obj as Record<string, unknown>)[key], currentDepth + 1, [...pathParts, key])) {
        return true
      }
    }

    return false
  }

  traverse(data, 0, [])
}

/**
 * Deep clone using iterative approach for better performance.
 */
const deepClone = <T>(value: T): T => {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime()) as T

  const root = Array.isArray(value) ? [] : {}
  const stack: { src: Record<string, unknown>; dst: Record<string, unknown>; keys: string[]; idx: number }[] = [{
    src: value as Record<string, unknown>,
    dst: root as Record<string, unknown>,
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

    // Primitives
    if (srcVal === null || srcVal === undefined || typeof srcVal !== 'object') {
      frame.dst[key] = srcVal
      continue
    }

    // Date
    if (srcVal instanceof Date) {
      frame.dst[key] = new Date(srcVal.getTime())
      continue
    }

    // Array or Object
    const cloned = Array.isArray(srcVal) ? [] : {}
    frame.dst[key] = cloned
    stack.push({
      src: srcVal as Record<string, unknown>,
      dst: cloned as Record<string, unknown>,
      keys: Object.keys(srcVal),
      idx: 0,
    })
  }

  return root as T
}

/**
 * Check if a value is a plain object (not array, Date, or null).
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

/**
 * Deep merge two values. Override values take precedence.
 * - Plain objects are recursively merged at all depths
 * - Arrays, primitives, Dates, null/undefined replace entirely
 */
const deepMerge = <T>(base: T, override: unknown): T => {
  // If override is null/undefined, keep base
  if (override === null || override === undefined) return base

  // If override is not a plain object, it replaces entirely
  if (!isPlainObject(override)) {
    return deepClone(override) as T
  }

  // If base is not a plain object, override replaces entirely
  if (!isPlainObject(base)) {
    return deepClone(override) as T
  }

  // Both are plain objects - merge recursively
  const result = { ...base } as Record<string, unknown>

  for (const key of Object.keys(override)) {
    const baseVal = result[key]
    const overrideVal = override[key]

    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      // Both are plain objects - recursively merge
      result[key] = deepMerge(baseVal, overrideVal)
    } else {
      // Override replaces (clone to avoid shared references)
      result[key] = deepClone(overrideVal)
    }
  }

  return result as T
}

/**
 * Recursively freeze an object to make it fully readonly.
 */
const deepFreeze = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj
  if (Object.isFrozen(obj)) return obj

  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item)
    }
    return Object.freeze(obj)
  }

  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  }
  return Object.freeze(obj)
}

/**
 * Callback for $forEach iteration.
 * For arrays: (value, index, array)
 * For objects: (value, key, object)
 */
export type ForEachCallback<T> = (
  value: unknown,
  keyOrIndex: T extends unknown[] ? number : string,
  parent: T
) => void

interface ConfigMethods<T> {
  $find: (query: string, options?: FindOptions) => unknown
  $findAll: (query: string, options?: FindOptions) => FindResult[]
  $findValue: (pattern: string, options?: FindOptions) => FindResult | undefined
  $findAllValues: (pattern: string, options?: FindOptions) => FindResult[]
  $forEach: (callback: ForEachCallback<T>) => void
  $clone: (query?: string, options?: FindOptions) => unknown
  $merge: (override: Partial<T> | Record<string, unknown>) => T
  $mergeJSON: (json: string) => T
  $freeze: () => T
}

/**
 * Creates the method implementations for a parsed config object.
 */
const createMethods = <T>(data: T): ConfigMethods<T> => ({
  $find: (query: string, options?: FindOptions): unknown => {
    const maxDepth = options?.depth ?? Infinity
    const segments = query.split('.')
    let result: unknown

    traverseFind(data, segments, maxDepth, (_path, value) => {
      result = value
      return true // Stop at first match
    })

    return result
  },

  $findAll: (query: string, options?: FindOptions): FindResult[] => {
    const maxDepth = options?.depth ?? Infinity
    const segments = query.split('.')
    const results: FindResult[] = []

    traverseFind(data, segments, maxDepth, (path, value) => {
      results.push({ key: path.join('.'), value })
      return false // Continue to find all
    })

    return results
  },

  $findValue: (pattern: string, options?: FindOptions): FindResult | undefined => {
    const maxDepth = options?.depth ?? Infinity
    let result: FindResult | undefined

    traverseFindValue(data, pattern, maxDepth, (path, value) => {
      result = { key: path.join('.'), value }
      return true // Stop at first match
    })

    return result
  },

  $findAllValues: (pattern: string, options?: FindOptions): FindResult[] => {
    const maxDepth = options?.depth ?? Infinity
    const results: FindResult[] = []

    traverseFindValue(data, pattern, maxDepth, (path, value) => {
      results.push({ key: path.join('.'), value })
      return false // Continue to find all
    })

    return results
  },

  $forEach: (callback: ForEachCallback<T>): void => {
    if (data === null || typeof data !== 'object') return

    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        callback(data[i], i as T extends unknown[] ? number : string, data)
      }
    } else {
      for (const key of Object.keys(data)) {
        callback(
          (data as Record<string, unknown>)[key],
          key as T extends unknown[] ? number : string,
          data
        )
      }
    }
  },

  $clone: (query?: string, options?: FindOptions): unknown => {
    if (query === undefined) {
      return deepClone(data)
    }

    const maxDepth = options?.depth ?? Infinity
    const segments = query.split('.')
    let result: unknown

    traverseFind(data, segments, maxDepth, (_path, value) => {
      result = deepClone(value)
      return true // Stop at first match
    })

    return result
  },

  $merge: (override: Partial<T> | Record<string, unknown>): T => {
    const merged = deepMerge(data, override)
    return wrapParsedConfig(merged)
  },

  $mergeJSON: (json: string): T => {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      throw new ParseError(`Invalid JSON: ${message}`)
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ParseError('$mergeJSON expects a JSON object, not an array or primitive')
    }
    const merged = deepMerge(data, parsed)
    return wrapParsedConfig(merged)
  },

  $freeze: (): T => {
    deepFreeze(data)
    return data
  },
})

// Method names for the proxy handler
const METHOD_NAMES = ['$find', '$findAll', '$findValue', '$findAllValues', '$forEach', '$clone', '$merge', '$mergeJSON', '$freeze'] as const

/**
 * Wraps parsed data in a Proxy that exposes utility methods.
 */
export const wrapParsedConfig = <T>(data: T): T => {
  const methods = createMethods(data)

  return new Proxy(data as object, {
    get: (target, prop) => {
      if (prop in methods) {
        return methods[prop as keyof typeof methods]
      }
      return (target as Record<string | symbol, unknown>)[prop]
    },
    has: (target, prop) => {
      if (METHOD_NAMES.includes(prop as typeof METHOD_NAMES[number])) {
        return true
      }
      return prop in target
    },
    ownKeys: (target) => Object.keys(target),
    getOwnPropertyDescriptor: (target, prop) => {
      if (prop in methods) {
        return {
          enumerable: false,
          configurable: true,
          value: methods[prop as keyof typeof methods],
          writable: false,
        }
      }
      return Object.getOwnPropertyDescriptor(target, prop)
    },
  }) as T
}

