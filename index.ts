export { parse } from './parse.js'
export { slimgify } from './slimgify.js'
export { ParseError, type NodeObject, type NodeValue, type Primitive } from './types.js'

// Default export for backward compatibility
import { parse } from './parse.js'
import { slimgify } from './slimgify.js'

export default {
  parse,
  slimgify,
}
