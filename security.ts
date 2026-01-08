/**
 * Security utilities for SlimGym parser.
 * Handles key validation, path sandboxing, and URL host validation.
 */

import * as path from 'node:path'
import { ParseError } from './types.js'

/** Keys that could cause prototype pollution or override built-ins. */
export const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
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

/** Default security limits. */
export const DEFAULT_MAX_DEPTH = 100
export const DEFAULT_MAX_ARRAY_SIZE = 10000
export const DEFAULT_MAX_IMPORT_DEPTH = 10

/**
 * Validates that a resolved path is within the allowed sandbox directory.
 * Prevents path traversal attacks.
 */
export const validatePathSandbox = (absolutePath: string, sandboxDir: string): void => {
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
export const validateUrlHost = (url: string, allowedHosts: string[]): void => {
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










