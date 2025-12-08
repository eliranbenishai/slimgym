export { parse, fetch, fetchAsync, fetchUrl, type ParseOptions, type FetchOptions, type FetchUrlOptions, type FindOptions } from './parse.js'
export { slimgify } from './slimgify.js'
export { ParseError, type NodeObject, type NodeValue, type Primitive } from './types.js'

// Default export for backward compatibility
import { parse, fetch, fetchAsync, fetchUrl } from './parse.js'
import { slimgify } from './slimgify.js'

export default {
  parse,
  fetch,
  fetchAsync,
  fetchUrl,
  slimgify,
}
