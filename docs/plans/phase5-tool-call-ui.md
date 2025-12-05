# Phase 5: Tool Call UI

Build rich tool call visualization with tool-specific renderers that display tool inputs and results in a user-friendly, expandable format.

## Current State

- [MessageBubble.tsx](codepilot/client/src/components/MessageBubble.tsx) has a basic `ToolCallBadge` placeholder (lines 126-164)
- Store already tracks `ToolCall` with: `id`, `name`, `input`, `status`, `result`, `error`
- Server tools return structured data:
  - `read_file`: `{ path, content }`
  - `write_file`: `{ path, status }`
  - `list_dir`: `[{ name, type }]`
  - `run_shell`: `{ command, cwd, stdout, stderr, exitCode }`

## Implementation Plan

### 1. Create ToolCallView Component

Create [codepilot/client/src/components/ToolCallView.tsx](codepilot/client/src/components/ToolCallView.tsx):

- Main `ToolCallView` wrapper with status indicator and expand/collapse header
- Tool router that dispatches to specific renderers based on `toolCall.name`
- Shared `ToolHeader` with tool icon, name, and status badge
- Collapse state management (default: collapsed for completed, expanded for pending)

### 2. Tool-Specific Renderers

Inside `ToolCallView.tsx`, implement:

| Renderer | Input Display | Result Display |

|----------|--------------|----------------|

| `ShellToolView` | Command with syntax highlight | stdout/stderr with exit code indicator |

| `ReadFileToolView` | File path as cyan chip | Content preview with line count |

| `WriteFileToolView` | File path + content preview | Success/failure status |

| `ListDirToolView` | Directory path | Grid of file/folder entries with icons |

### 3. Status States and Animations

- **Pending**: Pulsing violet border, spinning indicator, show input only
- **Completed**: Emerald status badge, show full result (collapsed by default)
- **Error**: Pink border/badge, show error message prominently

### 4. Expand/Collapse Behavior

- Truncate long outputs (>10 lines or >500 chars) with "Show more" button
- Code/file content in scrollable `max-h-64` container
- Shell output: separate stdout (emerald tint) and stderr (pink tint) sections

### 5. Update MessageBubble

Replace `ToolCallBadge` in [MessageBubble.tsx](codepilot/client/src/components/MessageBubble.tsx) with import of new `ToolCallView`.

## Design Tokens (from Starscape)

```
Pending:   border-violet-500/30, bg-violet-600/10
Completed: border-emerald-500/30, bg-emerald-500/10  
Error:     border-pink-500/30, bg-pink-500/10
File path: text-cyan-400
Command:   font-mono, bg-black/30
```

## Files to Create/Modify

| File | Action |

|------|--------|

| `components/ToolCallView.tsx` | Create (~200 lines) |

| `components/MessageBubble.tsx` | Modify - import ToolCallView, remove ToolCallBadge |

| `index.css` | Add tool-specific animations if needed |

---

## Summary

**Created** `codepilot/client/src/components/ToolCallView.tsx` (~450 lines) with:

1. **Main `ToolCallView` component** - Wrapper with status-based styling and expand/collapse header
2. **`ToolHeader`** - Shows tool icon, formatted name, summary, status badge, and expand chevron
3. **Tool-specific renderers**:
   - `ShellToolView` - Command display with `$` prefix, stdout/stderr with color-coded borders, exit code indicator
   - `ReadFileToolView` - File path chip, line count, scrollable content preview
   - `WriteFileToolView` - File path, success indicator, content preview of what was written
   - `ListDirToolView` - Directory path, grid of file/folder entries with icons
   - `GenericToolView` - Fallback for unknown tools showing JSON input/result
4. **Shared UI components**:
   - `FilePath` - Cyan-colored file/folder path chip
   - `CodeBlock` - Truncated code display with "Show more/less" toggle
   - `OutputBlock` - stdout/stderr blocks with success/warning/error color variants
   - `ErrorDisplay` - Pink error banner

**Modified** `codepilot/client/src/components/MessageBubble.tsx`:
- Imported `ToolCallView` component
- Replaced `ToolCallBadge` with `ToolCallView`
- Removed the old placeholder `ToolCallBadge` function

**Modified** `codepilot/client/src/index.css`:
- Added `animate-pulse-subtle` keyframe animation for pending tool states
