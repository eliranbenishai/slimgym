"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseError = void 0;
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
exports.ParseError = ParseError;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createParsedConfig = (data) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convertToJSON = (value) => {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (Array.isArray(value)) {
            return value.map(convertToJSON);
        }
        if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    result[key] = convertToJSON(value[key]);
                }
            }
            return result;
        }
        return value;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toJSON = () => convertToJSON(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(data, {
        get: (target, prop) => {
            if (prop === 'toJSON') {
                return toJSON;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
            return target[prop];
        },
        has: (target, prop) => {
            if (prop === 'toJSON') {
                return true;
            }
            return prop in target;
        },
        ownKeys: (target) => {
            return Object.keys(target);
        },
        getOwnPropertyDescriptor: (target, prop) => {
            if (prop === 'toJSON') {
                return {
                    enumerable: false,
                    configurable: true,
                    value: toJSON,
                    writable: false,
                };
            }
            return Object.getOwnPropertyDescriptor(target, prop);
        },
    });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parse = (input) => {
    if (typeof input !== 'string') {
        throw new ParseError('Input must be a string');
    }
    const lines = input.split('\n');
    const processed = [];
    const processedLineIndices = new Set();
    // First pass: handle logical lines, block strings (outside arrays), and identify array starts
    let i = 0;
    while (i < lines.length) {
        const raw = lines[i];
        const lineIndex = i;
        i++;
        if (/^\s*$/.test(raw))
            continue; // skip blank
        if (/^\s*#/.test(raw))
            continue; // skip comment
        // Skip lines already processed (inside block strings or arrays)
        if (processedLineIndices.has(lineIndex)) {
            continue;
        }
        const indentMatch = raw.match(/^ */);
        if (!indentMatch)
            continue;
        const indent = indentMatch[0].length;
        const content = raw.slice(indent).trim();
        // Skip lines that are just ` (block string closing markers)
        if (content === '`') {
            continue;
        }
        // Validate that line has content after stripping indent
        if (content.length === 0) {
            continue;
        }
        // Parse key and value, handling quoted strings properly
        const keyMatch = content.match(/^([a-zA-Z0-9_-]+)(\s+|$)/);
        if (!keyMatch) {
            // This might be a line inside a block string or array - skip it
            // Array items will be handled in the second pass
            // Lines inside block strings will be skipped (they're already processed)
            // But if it looks like a key-value pair with invalid key, throw error
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
        // Extract value, handling block strings and quoted strings
        let rest = '';
        if (afterKey.length > 0) {
            // Check for block string marker first
            if (afterKey === '`') {
                rest = '`';
            }
            else if (afterKey.startsWith('"') || afterKey.startsWith("'")) {
                // Quoted string - find the closing quote
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
                    // Unclosed quote - take the rest
                    rest = afterKey;
                }
            }
            else {
                // Not quoted - take everything (may contain spaces for unquoted values)
                rest = afterKey;
            }
        }
        let isBlockStringStart = false;
        let isArrayStart = false;
        let valueToken = null;
        // Check for inline array (key [item1, item2, ...] or key [])
        const inlineArrayMatch = content.match(/^([a-zA-Z0-9_-]+)\s+\[(.*)\]$/);
        if (inlineArrayMatch) {
            isArrayStart = true;
            const arrayContent = inlineArrayMatch[2].trim();
            // Empty array with spaces should throw an error
            if (arrayContent.length > 0 && /^\s+$/.test(arrayContent)) {
                throw new ParseError('Empty array syntax is invalid, use "key []" for empty array', lineIndex, raw);
            }
            valueToken = arrayContent;
            processed.push({ indent, key, valueToken, isBlockStringStart: false, isArrayStart: true, raw, rawLineIndex: lineIndex });
            processedLineIndices.add(lineIndex);
            continue;
        }
        // Check for multi-line array start (key [)
        if (rest.trim() === '[') {
            isArrayStart = true;
            valueToken = null; // Will be populated in second pass
            // Mark all array content lines as processed
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
        // Block string? (only process if not inside an array - arrays will handle their own block strings)
        if (rest === '`') {
            isBlockStringStart = true;
            const blockLines = [];
            let blockIndent = null;
            // Process block string content
            while (i < lines.length) {
                const nextRaw = lines[i];
                // Check for blank lines
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
                // Check for closing ` marker
                if (nextContent === '`' && nextIndent <= indent) {
                    processedLineIndices.add(i);
                    i++;
                    break;
                }
                // Detect block indent from first content line
                blockIndent ?? (blockIndent = nextIndent);
                // If indent is back to original level or less (and not """ and we've seen content), stop
                if (nextIndent < blockIndent) {
                    // Don't mark as processed - let outer loop handle it
                    break;
                }
                // Add content line
                if (nextIndent >= blockIndent) {
                    const lineContent = nextRaw.slice(blockIndent);
                    blockLines.push(lineContent);
                }
                processedLineIndices.add(i);
                i++;
            }
            valueToken = blockLines.join('\n');
        }
        else {
            valueToken = rest.length > 0 ? rest : null;
        }
        processed.push({ indent, key, valueToken, isBlockStringStart, isArrayStart, raw, rawLineIndex: lineIndex });
        processedLineIndices.add(lineIndex);
    }
    // Second pass: handle multi-line arrays by processing raw lines directly
    const processedWithArrays = [];
    for (const line of processed) {
        if (line.isArrayStart && line.valueToken === null) {
            // Multi-line array - process raw lines
            const arrayItems = [];
            const arrayIndent = line.indent;
            let foundClosingBracket = false;
            let lineIndex = line.rawLineIndex + 1; // Start after the opening bracket
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
                // Check for closing bracket
                if (rawContent === ']' && rawIndent <= arrayIndent) {
                    processedLineIndices.add(lineIndex);
                    foundClosingBracket = true;
                    lineIndex++;
                    break;
                }
                // If indent is less than or equal to array indent and not empty, we're done
                if (rawIndent <= arrayIndent && rawContent.length > 0 && rawContent !== ']') {
                    break;
                }
                // Collect array item
                if (rawIndent > arrayIndent) {
                    processedLineIndices.add(lineIndex);
                    // Check if this is a block string
                    if (rawContent === '`') {
                        // Process block string within array
                        const blockLines = [];
                        let blockIndent = null;
                        // Detect block indent from the first content line
                        for (let j = lineIndex + 1; j < lines.length; j++) {
                            const testRaw = lines[j];
                            if (/^\s*$/.test(testRaw))
                                continue;
                            const testMatch = testRaw.match(/^ */);
                            if (testMatch) {
                                const testIndent = testMatch[0].length;
                                const testContent = testRaw.slice(testIndent).trim();
                                if (testContent === '`' && testIndent <= rawIndent) {
                                    break;
                                }
                                if (testIndent > rawIndent) {
                                    blockIndent = testIndent;
                                    break;
                                }
                            }
                        }
                        blockIndent = blockIndent ?? rawIndent + 1;
                        lineIndex++; // Skip the ` line
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
                            // Check if this is the closing ` marker
                            if (nextIndent <= rawIndent && nextArrayContent === '`') {
                                processedLineIndices.add(lineIndex);
                                lineIndex++;
                                break;
                            }
                            // Check if we've reached the end of the block string
                            if (nextIndent <= rawIndent && !/^\s*$/.test(nextRaw)) {
                                break;
                            }
                            // Add content lines
                            if (nextIndent >= blockIndent && nextArrayContent !== '`') {
                                if (/^\s*$/.test(nextRaw)) {
                                    blockLines.push('');
                                }
                                else {
                                    blockLines.push(nextRaw.slice(blockIndent));
                                }
                            }
                            processedLineIndices.add(lineIndex);
                            lineIndex++;
                        }
                        const blockContent = blockLines.join('\n');
                        arrayItems.push(`"${blockContent}"`);
                    }
                    else {
                        // Regular array item - remove trailing comma
                        const cleaned = rawContent.replace(/,\s*$/, '');
                        if (cleaned.length > 0 && cleaned !== ']') {
                            arrayItems.push(cleaned);
                        }
                        lineIndex++;
                    }
                }
                else {
                    lineIndex++;
                }
            }
            if (!foundClosingBracket) {
                throw new ParseError('Unclosed array: missing closing bracket "]"', line.rawLineIndex, line.raw);
            }
            // Store array items
            line.valueToken = `[MULTILINE_ARRAY:${arrayItems.join('|ARRAY_SEP|')}]`;
        }
        processedWithArrays.push(line);
    }
    // Build tree using a stack of {indent, obj}
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    for (const line of processedWithArrays) {
        // Find parent
        while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].obj;
        let value;
        if (line.isArrayStart) {
            if (line.valueToken?.startsWith('[MULTILINE_ARRAY:') === true) {
                // Multi-line array
                const itemsStr = line.valueToken.slice(17, -1); // Remove prefix and suffix
                const items = itemsStr.split('|ARRAY_SEP|').filter(item => item.length > 0);
                value = items.map(item => parseValue(item.trim()));
            }
            else if (line.valueToken !== null && line.valueToken.trim().length > 0) {
                // Inline array
                const items = parseArrayItems(line.valueToken, line.rawLineIndex, line.raw);
                value = items.map(item => {
                    const trimmed = item.trim();
                    const parsed = parseValue(trimmed);
                    // If item looks like a nested array string, parse it recursively
                    if (typeof parsed === 'string' && trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        const nestedItems = parseArrayItems(trimmed.slice(1, -1));
                        return nestedItems.map(nestedItem => parseValue(nestedItem.trim()));
                    }
                    return parsed;
                });
            }
            else {
                // Empty array
                value = [];
            }
        }
        else {
            if (line.isBlockStringStart) {
                // Block strings are already processed, use valueToken as-is
                value = line.valueToken ?? '';
            }
            else {
                value = (line.valueToken !== null && line.valueToken.length > 0) ? parseValue(line.valueToken) : {};
            }
        }
        // Handle repeated keys as arrays
        if (Object.prototype.hasOwnProperty.call(parent, line.key)) {
            const existing = parent[line.key];
            if (Array.isArray(existing)) {
                existing.push(value);
            }
            else {
                parent[line.key] = [existing, value];
            }
        }
        else {
            parent[line.key] = value;
        }
        // If value is an object, descend into it
        if (isPlainObject(value)) {
            stack.push({ indent: line.indent, obj: value });
        }
    }
    return createParsedConfig(root);
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
            }
            else if (char === ']') {
                depth--;
                if (depth < 0) {
                    throw new ParseError('Unexpected closing bracket "]" in array', lineNumber, line);
                }
                current += char;
            }
            else if (char === '"' || char === "'") {
                inString = true;
                stringChar = char;
                current += char;
            }
            else if (char === ',' && depth === 0) {
                items.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        else {
            current += char;
            if (char === stringChar && (i === 0 || token[i - 1] !== '\\')) {
                inString = false;
                stringChar = '';
            }
        }
        i++;
    }
    // Check for unclosed string
    if (inString) {
        throw new ParseError('Unclosed string in array', lineNumber, line);
    }
    // Check for unmatched brackets
    if (depth !== 0) {
        throw new ParseError('Unmatched brackets in array', lineNumber, line);
    }
    if (current.trim().length > 0) {
        items.push(current.trim());
    }
    return items;
};
const parseValue = (token) => {
    // Block strings come in already as raw text (may contain \n)
    // Here token is a single-line or full block string content.
    // null / undefined
    if (token === 'null')
        return null;
    if (token === 'undefined')
        return undefined;
    // boolean
    if (token === 'true')
        return true;
    if (token === 'false')
        return false;
    // number
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(token)) {
        const num = Number(token);
        if (!Number.isNaN(num))
            return num;
    }
    // ISO-like datetime -> Date if valid (with T or space)
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(token)) {
        const d = new Date(token);
        if (!Number.isNaN(d.getTime()))
            return d;
    }
    // Quoted string
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
    // Fallback: plain string
    return token;
};
const isPlainObject = (v) => {
    return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
};
exports.default = {
    parse,
};
//# sourceMappingURL=parser.js.map