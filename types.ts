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
  public readonly lineNumber?: number
  public readonly line?: string
  public readonly columnNumber?: number
  public readonly codeFrame?: string

  constructor(message: string, lineNumber?: number, line?: string, columnNumber?: number) {
    const hasLine = lineNumber !== undefined && line !== undefined
    const hasColumn = hasLine && columnNumber !== undefined
    const location = hasLine
      ? ` at line ${lineNumber + 1}${hasColumn ? `, column ${columnNumber + 1}` : ''}`
      : ''
    const codeFrame = hasLine ? buildCodeFrame(line, lineNumber, columnNumber) : undefined
    const fullMessage = codeFrame ? `${message}${location}\n${codeFrame}` : `${message}${location}`

    super(fullMessage)
    this.name = 'ParseError'
    this.lineNumber = lineNumber
    this.line = line
    this.columnNumber = columnNumber
    this.codeFrame = codeFrame
  }
}

const buildCodeFrame = (line: string, lineNumber: number, columnNumber?: number): string => {
  const lineNo = lineNumber + 1
  const lineNoStr = String(lineNo)
  const gutter = `${lineNoStr} | `
  const safeColumn = columnNumber !== undefined
    ? Math.max(0, Math.min(columnNumber, line.length))
    : undefined

  if (safeColumn === undefined) {
    return `${gutter}${line}`
  }

  const caretLine = `${' '.repeat(lineNoStr.length)} | ${' '.repeat(safeColumn)}^`
  return `${gutter}${line}\n${caretLine}`
}
