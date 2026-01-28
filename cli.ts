#!/usr/bin/env node
/**
 * SlimGym CLI
 *
 * Commands:
 *   parse <file>     Parse .sg file and output JSON
 *   format <file>    Format/prettify a .sg file
 *   validate <file>  Validate syntax (exit 0 on success, 1 on error)
 *   convert <file>   Convert JSON file to SlimGym format
 *
 * Options:
 *   -o, --output <file>  Write to file instead of stdout
 *   -i, --indent <n>     JSON indent spaces (default: 2)
 *   -q, --quiet          Suppress output (validate only returns exit code)
 *   -h, --help           Show help
 *   -v, --version        Show version
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from './parse.js'
import { slimgify } from './slimgify.js'
import { ParseError } from './types.js'

interface CliOptions {
  output?: string
  indent: number
  quiet: boolean
}

const VERSION = '1.8.0'

const HELP = `
SlimGym CLI - An indentation-based configuration format

Usage:
  slimgym <command> <file> [options]

Commands:
  parse <file>      Parse .sg file and output JSON
  format <file>     Format/prettify a .sg file (parse → slimgify)
  validate <file>   Validate syntax (exit 0 on success, 1 on error)
  convert <file>    Convert JSON file to SlimGym format

Options:
  -o, --output <file>   Write to file instead of stdout
  -i, --indent <n>      JSON indent spaces (default: 2)
  -q, --quiet           Suppress output (useful for validate)
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  slimgym parse config.sg                    # Output JSON to stdout
  slimgym parse config.sg -o config.json     # Write JSON to file
  slimgym format config.sg                   # Prettify .sg file
  slimgym validate config.sg                 # Check syntax
  slimgym convert config.json -o config.sg   # JSON to SlimGym
`.trim()

/**
 * Parse CLI arguments into command, file, and options.
 */
function parseArgs(args: string[]): { command: string; file: string; options: CliOptions } | null {
  const options: CliOptions = {
    indent: 2,
    quiet: false,
  }

  let command = ''
  let file = ''
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      console.log(HELP)
      process.exit(0)
    }

    if (arg === '-v' || arg === '--version') {
      console.log(VERSION)
      process.exit(0)
    }

    if (arg === '-o' || arg === '--output') {
      i++
      const next: string | undefined = args[i]
      if (next === undefined) {
        console.error('Error: --output requires a file path')
        process.exit(1)
      }
      options.output = next
      continue
    }

    if (arg === '-i' || arg === '--indent') {
      i++
      const next: string | undefined = args[i]
      if (next === undefined) {
        console.error('Error: --indent requires a number')
        process.exit(1)
      }
      const indent = parseInt(next, 10)
      if (isNaN(indent) || indent < 0) {
        console.error('Error: --indent must be a non-negative number')
        process.exit(1)
      }
      options.indent = indent
      continue
    }

    if (arg === '-q' || arg === '--quiet') {
      options.quiet = true
      continue
    }

    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option "${arg}"`)
      console.error('Run "slimgym --help" for usage')
      process.exit(1)
    }

    positional.push(arg)
  }

  if (positional.length === 0) {
    return null
  }

  command = positional[0]
  file = positional[1] ?? ''

  return { command, file, options }
}

/**
 * Read file contents, handling errors gracefully.
 */
function readFile(filePath: string): string {
  const resolved = path.resolve(filePath)

  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${filePath}`)
    process.exit(1)
  }

  try {
    return fs.readFileSync(resolved, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Error reading file: ${message}`)
    process.exit(1)
  }
}

/**
 * Write output to file or stdout.
 */
function writeOutput(content: string, options: CliOptions): void {
  if (options.quiet) return

  if (options.output !== undefined) {
    try {
      fs.writeFileSync(options.output, content, 'utf8')
      console.error(`Written to ${options.output}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Error writing file: ${message}`)
      process.exit(1)
    }
  } else {
    console.log(content)
  }
}

/**
 * Parse command: .sg → JSON
 */
function cmdParse(file: string, options: CliOptions): void {
  const content = readFile(file)

  try {
    const parsed = parse(content)
    const json = JSON.stringify(parsed, null, options.indent)
    writeOutput(json, options)
  } catch (err) {
    if (err instanceof ParseError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}

/**
 * Format command: prettify .sg file
 */
function cmdFormat(file: string, options: CliOptions): void {
  const content = readFile(file)

  try {
    const parsed = parse(content)
    const formatted = slimgify(parsed)
    writeOutput(formatted, options)
  } catch (err) {
    if (err instanceof ParseError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}

/**
 * Validate command: check syntax
 */
function cmdValidate(file: string, options: CliOptions): void {
  const content = readFile(file)

  try {
    parse(content)
    if (!options.quiet) {
      console.log(`✓ ${file} is valid`)
    }
    process.exit(0)
  } catch (err) {
    if (err instanceof ParseError) {
      if (!options.quiet) {
        console.error(err.message)
      }
      process.exit(1)
    }
    throw err
  }
}

/**
 * Convert command: JSON → .sg
 */
function cmdConvert(file: string, options: CliOptions): void {
  const content = readFile(file)

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    console.error(`Error: Invalid JSON in ${file}`)
    process.exit(1)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('Error: JSON must be an object (not array or primitive)')
    process.exit(1)
  }

  const sg = slimgify(parsed as Record<string, unknown>)
  writeOutput(sg, options)
}

/**
 * Main CLI entry point.
 */
function main(): void {
  const args = process.argv.slice(2)
  const parsed = parseArgs(args)

  if (parsed === null) {
    console.log(HELP)
    process.exit(0)
  }

  const { command, file, options } = parsed

  if (file === '') {
    console.error(`Error: ${command} requires a file argument`)
    console.error('Run "slimgym --help" for usage')
    process.exit(1)
  }

  switch (command) {
    case 'parse':
      cmdParse(file, options)
      break
    case 'format':
      cmdFormat(file, options)
      break
    case 'validate':
      cmdValidate(file, options)
      break
    case 'convert':
      cmdConvert(file, options)
      break
    default:
      console.error(`Error: Unknown command "${command}"`)
      console.error('Run "slimgym --help" for usage')
      process.exit(1)
  }
}

main()
