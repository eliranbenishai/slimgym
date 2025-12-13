/**
 * File and URL fetching utilities for SlimGym.
 */

import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import { ParseError } from './types.js'
import { validatePathSandbox, validateUrlHost } from './security.js'
import type { ParseOptions } from './parser-helpers.js'

export interface FetchOptions {
  /** Base directory for resolving relative paths. Defaults to process.cwd(). */
  baseDir?: string
  /** Restrict file access to this directory. Prevents path traversal attacks. */
  sandboxDir?: string
  /** Maximum nesting depth for objects. Defaults to 100. */
  maxDepth?: number
  /** Maximum number of items in an array. Defaults to 10000. */
  maxArraySize?: number
  /** Maximum depth of @import chains. Defaults to 10. */
  maxImportDepth?: number
}

export interface FetchUrlOptions {
  /** Base URL for resolving relative imports. Defaults to the URL's base path. */
  baseUrl?: string
  /** Allowed hostnames for SSRF prevention. */
  allowedHosts?: string[]
  /** Maximum nesting depth for objects. Defaults to 100. */
  maxDepth?: number
  /** Maximum number of items in an array. Defaults to 10000. */
  maxArraySize?: number
  /** Maximum depth of @import chains. Defaults to 10. */
  maxImportDepth?: number
  /** HTTP headers to include in the request. */
  headers?: Record<string, string> | Headers | [string, string][]
  /** AbortSignal for request cancellation/timeout. */
  signal?: AbortSignal
  /** HTTP method. Defaults to 'GET'. */
  method?: 'GET' | 'HEAD' | 'OPTIONS'
}

// Forward declaration for parse function (set from parse.ts)
let parseFunction: (<T>(input: string, options?: ParseOptions) => T) | null = null

/** Sets the parse function reference (called from parse.ts). */
export const setFetchParseFunction = (fn: <T>(input: string, options?: ParseOptions) => T): void => {
  parseFunction = fn
}

const handleFileError = (error: unknown, absolutePath: string): never => {
  if (error instanceof ParseError) throw error

  const err = error as NodeJS.ErrnoException
  if (err.code === 'ENOENT') throw new ParseError(`File not found: "${absolutePath}"`)
  if (err.code === 'EACCES') throw new ParseError(`Permission denied: "${absolutePath}"`)
  if (err.code === 'EISDIR') throw new ParseError(`Path is a directory, not a file: "${absolutePath}"`)
  throw new ParseError(`Failed to read file "${absolutePath}": ${err.message}`)
}

const resolveFilePath = (filePath: string, options?: FetchOptions): string => {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new ParseError('File path must be a non-empty string')
  }

  const baseDir = options?.baseDir ?? process.cwd()
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath)

  if (options?.sandboxDir != null && options.sandboxDir !== '') {
    validatePathSandbox(absolutePath, options.sandboxDir)
  }

  return absolutePath
}

const createParseOptions = (absolutePath: string, options?: FetchOptions): ParseOptions => ({
  baseDir: path.dirname(absolutePath),
  maxDepth: options?.maxDepth,
  maxArraySize: options?.maxArraySize,
  maxImportDepth: options?.maxImportDepth,
  _sandboxDir: options?.sandboxDir,
})

export const file = <T = any>(filePath: string, options?: FetchOptions): T => {
  if (parseFunction === null) {
    throw new ParseError('Parser not initialized')
  }

  const absolutePath = resolveFilePath(filePath, options)

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8')
    return parseFunction<T>(content, createParseOptions(absolutePath, options))
  } catch (error) {
    return handleFileError(error, absolutePath)
  }
}

export const fileAsync = async <T = any>(filePath: string, options?: FetchOptions): Promise<T> => {
  if (parseFunction === null) {
    throw new ParseError('Parser not initialized')
  }

  const absolutePath = resolveFilePath(filePath, options)

  try {
    const content = await fsPromises.readFile(absolutePath, 'utf-8')
    return parseFunction<T>(content, createParseOptions(absolutePath, options))
  } catch (error) {
    return handleFileError(error, absolutePath)
  }
}

export const fetch = async <T = any>(url: string, options?: FetchUrlOptions): Promise<T> => {
  if (parseFunction === null) {
    throw new ParseError('Parser not initialized')
  }

  if (typeof url !== 'string' || url.trim() === '') {
    throw new ParseError('URL must be a non-empty string')
  }

  if (options?.allowedHosts != null && options.allowedHosts.length > 0) {
    validateUrlHost(url, options.allowedHosts)
  }

  try {
    const response = await globalThis.fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      signal: options?.signal,
    })
    if (!response.ok) {
      throw new ParseError(`Failed to fetch "${url}": ${response.status} ${response.statusText}`)
    }

    const content = await response.text()
    const baseUrl = options?.baseUrl ?? new URL('.', url).href

    return parseFunction<T>(content, {
      baseDir: baseUrl,
      maxDepth: options?.maxDepth,
      maxArraySize: options?.maxArraySize,
      maxImportDepth: options?.maxImportDepth,
    })
  } catch (error) {
    if (error instanceof ParseError) throw error
    throw new ParseError(`Failed to fetch "${url}": ${(error as Error).message}`)
  }
}

