export { parse, file, fileAsync, fetch, type ParseOptions, type FetchOptions, type FetchUrlOptions, type FindOptions, type FindResult } from './parse.js'
export { slimgify } from './slimgify.js'
export { ParseError, type NodeObject, type NodeValue, type Primitive } from './types.js'
export { type ForEachCallback } from './config-wrapper.js'

// Default export for backward compatibility
import { parse, file, fileAsync, fetch } from './parse.js'
import { slimgify } from './slimgify.js'

export default {
  parse,
  file,
  fileAsync,
  fetch,
  slimgify,
}
