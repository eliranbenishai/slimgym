export type Primitive = string | number | boolean | null | undefined | Date
export type NodeValue = Primitive | NodeObject | NodeValue[] | undefined | null
export interface NodeObject {
  [key: string]: NodeValue
}

export interface LineInfo {
  indent: number
  key: string
  valueToken: string | null
  isBlockStringStart: boolean
  isArrayStart: boolean
  raw: string
  rawLineIndex: number // Track original line index
}

export class ParseError extends Error {
  constructor(message: string, public readonly lineNumber?: number, public readonly line?: string) {
    super(lineNumber !== undefined && line !== undefined
      ? `${message} at line ${lineNumber + 1}: "${line}"`
      : message)
    this.name = 'ParseError'
  }
}
