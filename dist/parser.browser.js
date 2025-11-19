// Browser-compatible bundle of slimgym parser
(function(global) {
  'use strict';

  class ParseError extends Error {
    constructor(message, lineNumber, line) {
      super(lineNumber !== undefined && line !== undefined
        ? `${message} at line ${lineNumber + 1}: "${line}"`
        : message);
      this.lineNumber = lineNumber;
      this.line = line;
      this.name = 'ParseError';
    }
  }

  const parse = (input) => {
    if (typeof input !== 'string') {
      throw new ParseError('Input must be a string');
    }
    const lines = input.split('\n');
    const processed = [];
    const processedLineIndices = new Set();
    let i = 0;
    while (i < lines.length) {
      const raw = lines[i];
      const lineIndex = i;
      i++;
      if (/^\s*$/.test(raw)) continue;
      if (/^\s*#/.test(raw)) continue;
      if (processedLineIndices.has(lineIndex)) {
        continue;
      }
      const indentMatch = raw.match(/^ */);
      if (!indentMatch) continue;
      const indent = indentMatch[0].length;
      const content = raw.slice(indent).trim();
      if (content === '"""') {
        continue;
      }
      if (content.length === 0) {
        continue;
      }
      const keyMatch = content.match(/^([a-zA-Z0-9_-]+)(\s+|$)/);
      if (!keyMatch) {
        if (!processedLineIndices.has(lineIndex)) {
          const looksLikeKeyValue = content.match(/^([^\s]+)\s+/);
          if (looksLikeKeyValue) {
            const potentialKey = looksLikeKeyValue[1];
            if (!/^[a-zA-Z0-9_-]+$/.test(potentialKey)) {
              throw new ParseError(`Invalid key format: "${potentialKey}"`, lineIndex, raw);
            }
          }
        }
        continue;
      }
      const key = keyMatch[1];
      const afterKey = content.slice(keyMatch[0].length).trim();
      let rest = '';
      if (afterKey.length > 0) {
        if (afterKey === '"""') {
          rest = '"""';
        } else if (afterKey.startsWith('"') || afterKey.startsWith("'")) {
          const quoteChar = afterKey[0];
          let quoteIndex = 1;
          while (quoteIndex < afterKey.length) {
            if (afterKey[quoteIndex] === quoteChar && (quoteIndex === 0 || afterKey[quoteIndex - 1] !== '\\')) {
              rest = afterKey.slice(0, quoteIndex + 1);
              break;
            }
            quoteIndex++;
          }
          if (quoteIndex >= afterKey.length) {
            rest = afterKey;
          }
        } else {
          rest = afterKey;
        }
      }
      let isBlockStringStart = false;
      let isArrayStart = false;
      let valueToken = null;
      const inlineArrayMatch = content.match(/^([a-zA-Z0-9_-]+)\s+\[(.*)\]$/);
      if (inlineArrayMatch) {
        isArrayStart = true;
        const arrayContent = inlineArrayMatch[2].trim();
        if (arrayContent.length > 0 && /^\s+$/.test(arrayContent)) {
          throw new ParseError('Empty array syntax is invalid, use "key []" for empty array', lineIndex, raw);
        }
        valueToken = arrayContent;
        processed.push({ indent, key, valueToken, isBlockStringStart: false, isArrayStart: true, raw, rawLineIndex: lineIndex });
        processedLineIndices.add(lineIndex);
        continue;
      }
      if (rest.trim() === '[') {
        isArrayStart = true;
        valueToken = null;
        let arrayLineIndex = i;
        while (arrayLineIndex < lines.length) {
          const arrayRaw = lines[arrayLineIndex];
          if (/^\s*$/.test(arrayRaw) || /^\s*#/.test(arrayRaw)) {
            processedLineIndices.add(arrayLineIndex);
            arrayLineIndex++;
            continue;
          }
          const arrayIndentMatch = arrayRaw.match(/^ */);
          if (!arrayIndentMatch) {
            processedLineIndices.add(arrayLineIndex);
            arrayLineIndex++;
            continue;
          }
          const arrayIndent = arrayIndentMatch[0].length;
          const arrayContent = arrayRaw.slice(arrayIndent).trim();
          if (arrayContent === ']' && arrayIndent <= indent) {
            processedLineIndices.add(arrayLineIndex);
            break;
          }
          if (arrayIndent <= indent) {
            break;
          }
          processedLineIndices.add(arrayLineIndex);
          arrayLineIndex++;
        }
        processed.push({ indent, key, valueToken, isBlockStringStart: false, isArrayStart: true, raw, rawLineIndex: lineIndex });
        processedLineIndices.add(lineIndex);
        continue;
      }
      if (rest === '"""') {
        isBlockStringStart = true;
        const blockLines = [];
        let blockIndent = null;
        while (i < lines.length) {
          const nextRaw = lines[i];
          if (/^\s*$/.test(nextRaw)) {
            if (blockIndent !== null) {
              blockLines.push('');
            }
            processedLineIndices.add(i);
            i++;
            continue;
          }
          const nextIndentMatch = nextRaw.match(/^ */);
          if (!nextIndentMatch) {
            processedLineIndices.add(i);
            i++;
            continue;
          }
          const nextIndent = nextIndentMatch[0].length;
          const nextContent = nextRaw.slice(nextIndent).trim();
          if (nextContent === '"""' && nextIndent <= indent) {
            processedLineIndices.add(i);
            i++;
            break;
          }
          if (blockIndent === null) {
            blockIndent = nextIndent;
          }
          if (nextIndent < blockIndent) {
            break;
          }
          if (nextIndent >= blockIndent) {
            const lineContent = nextRaw.slice(blockIndent);
            blockLines.push(lineContent);
          }
          processedLineIndices.add(i);
          i++;
        }
        valueToken = blockLines.join('\n');
      } else {
        valueToken = rest.length > 0 ? rest : null;
      }
      processed.push({ indent, key, valueToken, isBlockStringStart, isArrayStart, raw, rawLineIndex: lineIndex });
      processedLineIndices.add(lineIndex);
    }
    const processedWithArrays = [];
    for (const line of processed) {
      if (line.isArrayStart && line.valueToken === null) {
        const arrayItems = [];
        const arrayIndent = line.indent;
        let foundClosingBracket = false;
        let lineIndex = line.rawLineIndex + 1;
        while (lineIndex < lines.length) {
          const rawLine = lines[lineIndex];
          if (/^\s*$/.test(rawLine)) {
            processedLineIndices.add(lineIndex);
            lineIndex++;
            continue;
          }
          if (/^\s*#/.test(rawLine)) {
            processedLineIndices.add(lineIndex);
            lineIndex++;
            continue;
          }
          const rawIndentMatch = rawLine.match(/^ */);
          if (!rawIndentMatch) {
            processedLineIndices.add(lineIndex);
            lineIndex++;
            continue;
          }
          const rawIndent = rawIndentMatch[0].length;
          const rawContent = rawLine.slice(rawIndent).trim();
          if (rawContent === ']' && rawIndent <= arrayIndent) {
            processedLineIndices.add(lineIndex);
            foundClosingBracket = true;
            lineIndex++;
            break;
          }
          if (rawIndent <= arrayIndent && rawContent.length > 0 && rawContent !== ']') {
            break;
          }
          if (rawIndent > arrayIndent) {
            processedLineIndices.add(lineIndex);
            if (rawContent === '"""') {
              const blockLines = [];
              let blockIndent = null;
              for (let j = lineIndex + 1; j < lines.length; j++) {
                const testRaw = lines[j];
                if (/^\s*$/.test(testRaw)) continue;
                const testMatch = testRaw.match(/^ */);
                if (testMatch) {
                  const testIndent = testMatch[0].length;
                  const testContent = testRaw.slice(testIndent).trim();
                  if (testContent === '"""' && testIndent <= rawIndent) {
                    break;
                  }
                  if (testIndent > rawIndent) {
                    blockIndent = testIndent;
                    break;
                  }
                }
              }
              blockIndent = blockIndent === null ? rawIndent + 1 : blockIndent;
              lineIndex++;
              while (lineIndex < lines.length) {
                const nextRaw = lines[lineIndex];
                const nextIndentMatch = nextRaw.match(/^ */);
                if (!nextIndentMatch) {
                  processedLineIndices.add(lineIndex);
                  lineIndex++;
                  continue;
                }
                const nextIndent = nextIndentMatch[0].length;
                const nextArrayContent = nextRaw.slice(nextIndent).trim();
                if (nextIndent <= rawIndent && nextArrayContent === '"""') {
                  processedLineIndices.add(lineIndex);
                  lineIndex++;
                  break;
                }
                if (nextIndent <= rawIndent && !/^\s*$/.test(nextRaw)) {
                  break;
                }
                if (nextIndent >= blockIndent && nextArrayContent !== '"""') {
                  if (/^\s*$/.test(nextRaw)) {
                    blockLines.push('');
                  } else {
                    blockLines.push(nextRaw.slice(blockIndent));
                  }
                }
                processedLineIndices.add(lineIndex);
                lineIndex++;
              }
              const blockContent = blockLines.join('\n');
              arrayItems.push(`"${blockContent}"`);
            } else {
              const cleaned = rawContent.replace(/,\s*$/, '');
              if (cleaned.length > 0 && cleaned !== ']') {
                arrayItems.push(cleaned);
              }
              lineIndex++;
            }
          } else {
            lineIndex++;
          }
        }
        if (!foundClosingBracket) {
          throw new ParseError('Unclosed array: missing closing bracket "]"', line.rawLineIndex, line.raw);
        }
        line.valueToken = `[MULTILINE_ARRAY:${arrayItems.join('|ARRAY_SEP|')}]`;
      }
      processedWithArrays.push(line);
    }
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    for (const line of processedWithArrays) {
      while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].obj;
      let value;
      if (line.isArrayStart) {
        if (line.valueToken && line.valueToken.startsWith('[MULTILINE_ARRAY:') === true) {
          const itemsStr = line.valueToken.slice(17, -1);
          const items = itemsStr.split('|ARRAY_SEP|').filter(item => item.length > 0);
          value = items.map(item => parseValue(item.trim()));
        } else if (line.valueToken !== null && line.valueToken.trim().length > 0) {
          const items = parseArrayItems(line.valueToken, line.rawLineIndex, line.raw);
          value = items.map(item => {
            const trimmed = item.trim();
            const parsed = parseValue(trimmed);
            if (typeof parsed === 'string' && trimmed.startsWith('[') && trimmed.endsWith(']')) {
              const nestedItems = parseArrayItems(trimmed.slice(1, -1));
              return nestedItems.map(nestedItem => parseValue(nestedItem.trim()));
            }
            return parsed;
          });
        } else {
          value = [];
        }
      } else {
        if (line.isBlockStringStart) {
          value = line.valueToken === null ? '' : line.valueToken;
        } else {
          value = (line.valueToken !== null && line.valueToken.length > 0) ? parseValue(line.valueToken) : {};
        }
      }
      if (Object.prototype.hasOwnProperty.call(parent, line.key)) {
        const existing = parent[line.key];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          parent[line.key] = [existing, value];
        }
      } else {
        parent[line.key] = value;
      }
      if (isPlainObject(value)) {
        stack.push({ indent: line.indent, obj: value });
      }
    }
    return root;
  };

  const parseArrayItems = (token, lineNumber, line) => {
    const items = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let i = 0;
    while (i < token.length) {
      const char = token[i];
      if (!inString) {
        if (char === '[') {
          depth++;
          current += char;
        } else if (char === ']') {
          depth--;
          if (depth < 0) {
            throw new ParseError('Unexpected closing bracket "]" in array', lineNumber, line);
          }
          current += char;
        } else if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === ',' && depth === 0) {
          items.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === stringChar && (i === 0 || token[i - 1] !== '\\')) {
          inString = false;
          stringChar = '';
        }
      }
      i++;
    }
    if (inString) {
      throw new ParseError('Unclosed string in array', lineNumber, line);
    }
    if (depth !== 0) {
      throw new ParseError('Unmatched brackets in array', lineNumber, line);
    }
    if (current.trim().length > 0) {
      items.push(current.trim());
    }
    return items;
  };

  const parseValue = (token) => {
    if (token === 'null') return null;
    if (token === 'undefined') return undefined;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) {
      const num = Number(token);
      if (!Number.isNaN(num)) return num;
    }
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(token)) {
      const d = new Date(token);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      const inner = token.slice(1, -1);
      return inner.replace(/\\(["'nrt\\])/g, (_, ch) => {
        switch (ch) {
          case 'n': return '\n';
          case 'r': return '\r';
          case 't': return '\t';
          case '"': return '"';
          case "'": return "'";
          case '\\': return '\\';
          default: return ch;
        }
      });
    }
    return token;
  };

  const isPlainObject = (v) => {
    return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
  };

  global.slimgym = {
    parse,
    ParseError
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
