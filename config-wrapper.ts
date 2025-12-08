/**
 * Wraps parsed data with utility methods ($find, $findAll, $clone, $freeze).
 * Methods use $ prefix to avoid conflicts with user data keys.
 */

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

// Shared pattern matching for $find and $findAll
const matchPattern = (key: string, pattern: string): boolean => {
  if (pattern === '*') return true
  if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
    return key.includes(pattern.slice(1, -1))
  }
  if (pattern.startsWith('*')) {
    return key.endsWith(pattern.slice(1))
  }
  if (pattern.endsWith('*')) {
    return key.startsWith(pattern.slice(0, -1))
  }
  return key === pattern
}

const hasWildcard = (pattern: string): boolean => pattern.includes('*')

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

    if (hasWildcard(pattern)) {
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

interface ConfigMethods<T> {
  $find: (query: string, options?: FindOptions) => unknown
  $findAll: (query: string, options?: FindOptions) => FindResult[]
  $clone: () => T
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

  $clone: (): T => deepClone(data),

  $freeze: (): T => {
    deepFreeze(data)
    return data
  },
})

// Method names for the proxy handler
const METHOD_NAMES = ['$find', '$findAll', '$clone', '$freeze'] as const

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

