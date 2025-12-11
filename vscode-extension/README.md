# SlimGym for VS Code

Syntax highlighting for [SlimGym](https://github.com/eliranbenishai/slimgym) configuration files (`.sg`).

## Features

- **Syntax highlighting** for all SlimGym constructs:
  - Keys and nested objects
  - Strings (single, double, and block strings with `"""`)
  - Numbers, booleans, null, undefined
  - Dates (ISO format)
  - Arrays (inline and multi-line)
  - Comments (`#`)
  - File imports (`@"path"`)

- **Auto-closing pairs** for brackets, quotes, and block strings
- **Comment toggling** with `Ctrl+/` / `Cmd+/`

## Example

```slimgym
# Application config
app
  name "MyApp"
  port 8080
  debug true

database
  host "localhost"
  credentials @"./secrets.sg"

tags ["api", "production"]

description """
  A multi-line
  description here
"""
```

## Installation

Search for "SlimGym" in the VS Code Extensions panel, or install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=eliranbenishai.slimgym).

## Related

- [SlimGym npm package](https://www.npmjs.com/package/slimgym) — Parse and serialize SlimGym files in JavaScript/TypeScript

