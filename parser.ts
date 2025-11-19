type Primitive = string | number | boolean | null | undefined | Date;
type NodeValue = Primitive | NodeObject | NodeValue[] | undefined;
interface NodeObject {
  [key: string]: NodeValue;
}

interface LineInfo {
  indent: number;
  key: string;
  valueToken: string | null;
  isBlockStringStart: boolean;
  raw: string;
}

/**
 * Parse our indentation-based config string into a JS object.
 */
export function parseConfig(input: string): NodeObject {
  const lines = input.split("\n");
  const processed: LineInfo[] = [];

  // First, handle logical lines and block strings
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    i++;

    if (/^\s*$/.test(raw)) continue; // skip blank
    if (/^\s*#/.test(raw)) continue; // skip comment

    const indent = raw.match(/^ */)![0].length;
    const content = raw.slice(indent);

    const parts = content.split(/\s+/, 2);
    const key = parts[0];
    let rest = parts.length > 1 ? parts[1] : "";

    // Block string?
    let isBlockStringStart = false;
    let valueToken: string | null = null;

    if (rest === '"""') {
      isBlockStringStart = true;

      const blockLines: string[] = [];
      const blockIndent = detectBlockIndent(lines, i);

      while (i < lines.length) {
        const nextRaw = lines[i];
        const nextIndent = nextRaw.match(/^ */)![0].length;
        if (nextIndent <= indent && !/^\s*$/.test(nextRaw)) {
          break;
        }
        if (nextIndent >= blockIndent) {
          blockLines.push(nextRaw.slice(blockIndent));
        } else if (/^\s*$/.test(nextRaw)) {
          blockLines.push("");
        }
        i++;
      }

      // Join with \n, preserve internal blank lines
      valueToken = blockLines.join("\n");
    } else {
      valueToken = rest.length ? rest : null;
    }

    processed.push({ indent, key, valueToken, isBlockStringStart, raw });
  }

  // Build tree using a stack of {indent, obj}
  const root: NodeObject = {};
  const stack: { indent: number; obj: NodeObject }[] = [{ indent: -1, obj: root }];

  for (const line of processed) {
    // Find parent
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    const value = line.valueToken !== null ? parseValue(line.valueToken) : {};

    // Handle repeated keys as arrays
    if (Object.prototype.hasOwnProperty.call(parent, line.key)) {
      const existing = parent[line.key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        parent[line.key] = [existing as NodeValue, value];
      }
    } else {
      parent[line.key] = value;
    }

    // If value is an object, descend into it
    if (isPlainObject(value)) {
      stack.push({ indent: line.indent, obj: value as NodeObject });
    }
  }

  return root;
}

function detectBlockIndent(lines: string[], startIndex: number): number {
  // First non-empty line after start defines block indent
  for (let j = startIndex; j < lines.length; j++) {
    const raw = lines[j];
    if (/^\s*$/.test(raw)) continue;
    return raw.match(/^ */)![0].length;
  }
  // Fallback: treat as no extra indent
  return 0;
}

function parseValue(token: string): NodeValue {
  // Block strings come in already as raw text (may contain \n)
  // Here token is a single-line or full block string content.

  // null / undefined
  if (token === "null") return null;
  if (token === "undefined") return undefined;

  // boolean
  if (token === "true") return true;
  if (token === "false") return false;

  // number
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) {
    const num = Number(token);
    if (!Number.isNaN(num)) return num;
  }

  // ISO-like datetime -> Date if valid
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/.test(token)) {
    const d = new Date(token);
    if (!isNaN(d.getTime())) return d;
  }

  // Quoted string
  if ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))) {
    const inner = token.slice(1, -1);
    return inner.replace(/\\(["'nrt\\])/g, (_, ch) => {
      switch (ch) {
        case "n": return "\n";
        case "r": return "\r";
        case "t": return "\t";
        case '"': return '"';
        case "'": return "'";
        case "\\": return "\\";
        default: return ch;
      }
    });
  }

  // Fallback: plain string
  return token;
}

function isPlainObject(v: unknown): v is NodeObject {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}
