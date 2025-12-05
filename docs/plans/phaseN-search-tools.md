# Search Tools Implementation

## Why Dedicated Tools?

While `run_shell` can execute grep/find, dedicated tools provide:

- Structured JSON output (file, line, content) vs raw text
- Automatic .gitignore respect (skip node_modules, dist, etc.)
- Result limiting to prevent context overflow
- No shell escaping issues with special characters
- Better error messages

---

## Tools to Implement

### 1. `grep` - Search file contents

```typescript
// server/src/tools/searchTools.ts
{
  name: 'grep',
  description: 'Search for text patterns across files. Returns matching lines with context.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text or regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search (default: project root)' },
      regex: { type: 'boolean', description: 'Treat pattern as regex (default: false)' },
      caseSensitive: { type: 'boolean', description: 'Case sensitive search (default: false)' },
      maxResults: { type: 'number', description: 'Maximum matches to return (default: 50)' },
    },
    required: ['pattern'],
  },
  // Returns: [{ file: string, line: number, content: string, context?: string[] }]
}
```

### 2. `find_files` - Search by filename

```typescript
{
  name: 'find_files',
  description: 'Find files by name pattern (glob). Respects .gitignore.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., "*.ts", "**/*.test.js")' },
      path: { type: 'string', description: 'Directory to search (default: project root)' },
      maxResults: { type: 'number', description: 'Maximum files to return (default: 100)' },
    },
    required: ['pattern'],
  },
  // Returns: [{ path: string, type: 'file' | 'dir', size?: number }]
}
```

---

## Implementation Approach

### Option A: Use ripgrep (rg) via shell

- Fastest option, already respects .gitignore
- Parse JSON output from `rg --json`
- Fallback to native if rg not installed

### Option B: Pure Node.js with fast-glob

- No external dependency
- Use `fast-glob` for file finding
- Use `fs` + line-by-line reading for grep
- Manual .gitignore parsing via `ignore` package

**Recommended: Option A with B as fallback**

---

## Key Files

| File | Changes |

|------|---------|

| [`server/src/tools/searchTools.ts`](codepilot/server/src/tools/searchTools.ts) | NEW: grep and find_files tools |

| [`server/src/tools/index.ts`](codepilot/server/src/tools/index.ts) | Register new tools |

| [`server/package.json`](codepilot/server/package.json) | Add `fast-glob`, `ignore` deps (for fallback) |

---

## Implementation Details

### ripgrep JSON Output Parsing

```typescript
// rg --json output produces lines like:
// {"type":"match","data":{"path":{"text":"src/foo.ts"},"lines":{"text":"const x = 1;\n"},"line_number":42}}

interface RgMatch {
  type: 'match' | 'begin' | 'end' | 'summary';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
}
```

### .gitignore Handling

For the pure Node fallback:

```typescript
import ignore from 'ignore';
import fs from 'fs/promises';

async function loadGitignore(rootDir: string) {
  const ig = ignore();
  try {
    const gitignore = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf8');
    ig.add(gitignore);
  } catch { /* no .gitignore */ }
  // Always ignore common patterns
  ig.add(['node_modules', '.git', 'dist', 'build', '.next']);
  return ig;
}
```

### Result Limiting

Both tools enforce `maxResults` to prevent:

- Overwhelming the LLM context window
- Slow responses from huge result sets
- Memory issues

Default limits: grep=50 matches, find_files=100 files
