# Agent Commands Implementation

## Architecture Overview

Agent Commands are workflow modes that modify the agent's behavior via specialized system prompts. Users can invoke them via:

1. **UI Selector** - Dropdown in the header (similar to model selector)
2. **Natural Language** - Detection when message starts with trigger phrases like "Research...", "Plan..."

---

## Key Files

| File | Purpose |

|------|---------|

| [`server/src/agent/commands.ts`](codepilot/server/src/agent/commands.ts) | NEW: Command definitions, detection, LLM classifier |

| [`server/src/agent/messages.ts`](codepilot/server/src/agent/messages.ts) | Command-specific system prompts |

| [`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts) | Accept `command` param, run classifier |

| [`server/src/session.ts`](codepilot/server/src/session.ts) | Plan storage functions |

| [`server/src/db.ts`](codepilot/server/src/db.ts) | Add `current_plan` column |

| [`client/src/store/useAgentStore.ts`](codepilot/client/src/store/useAgentStore.ts) | Command state |

| [`client/src/App.tsx`](codepilot/client/src/App.tsx) | CommandSelector dropdown |

---

## Command Definitions

```typescript
// server/src/agent/commands.ts
export type CommandId = 
  | 'chat'              // Default conversational mode
  | 'research'          // Research Codebase
  | 'create_plan'       // Create Plan
  | 'revise_plan'       // Revise Plan (references session's currentPlan)
  | 'implement_simple'  // Quick implementation (bug fixes, small features)
  | 'implement_complex'; // Execute multi-step plan methodically
```

---

## LLM-Based Command Classification

### Implementation Routing

When user invokes "implement" (via dropdown or detected phrase), make a fast LLM call to classify:

```typescript
// server/src/agent/commands.ts
export async function classifyImplementationType(
  message: string,
  hasCurrentPlan: boolean
): Promise<'simple' | 'complex'> {
  // Use fast model (Haiku) for classification
  const response = await classifierLLM.complete({
    messages: [{
      role: 'user',
      content: `Classify this implementation request as SIMPLE or COMPLEX.

SIMPLE: Bug fixes, small features, single-file changes, straightforward tasks, 
        clear instructions that can be done directly.

COMPLEX: Multi-step plans, large refactors, cross-file changes, tasks requiring 
         systematic approach, contains numbered steps or checklist items,
         references an existing plan.

${hasCurrentPlan ? 'Note: User has an existing plan in this session.' : ''}

User request:
"""
${message}
"""

Reply with only: SIMPLE or COMPLEX`
    }]
  });
  
  return response.includes('COMPLEX') ? 'complex' : 'simple';
}
```

### Classification Triggers

The classifier runs when:

1. User selects "Implement" from dropdown (no sub-mode specified)
2. Message matches implement patterns but mode is ambiguous
3. Message contains what looks like a plan (defer to LLM to confirm)

Skip classifier when:

- User explicitly selects "Implement (Simple)" or "Implement (Complex)"
- Clear regex match for simple triggers: "fix the bug in...", "add a button to..."

---

## System Prompts

### Research Codebase

- Use `list_dir`, `read_file`, `run_shell` (grep/find) extensively
- Summarize findings clearly with file references
- Do NOT make any changes

### Create Plan  

- Analyze requirements before planning
- Produce structured markdown with numbered steps
- Identify files that need changes
- Store result in session's `currentPlan`

### Revise Plan

- Read `currentPlan` from session OR accept pasted plan
- Understand requested changes
- Produce updated plan, mark what changed
- Update session's `currentPlan`

### Implement Simple

- Direct implementation without formal planning
- Read files before editing
- Make minimal, focused changes
- Summarize what was done

### Implement Complex

- Read `currentPlan` from session OR parse plan from message
- Execute steps in order, announce each step
- Check off completed items mentally
- Report progress and blockers

---

## Plan State Management

### Database Change

Add column to sessions table:

```sql
ALTER TABLE sessions ADD COLUMN current_plan TEXT;
```

### Session Functions

```typescript
// server/src/session.ts
setSessionPlan(sessionId: string, plan: string): void
getSessionPlan(sessionId: string): string | null
```

### Plan Extraction

After Create Plan completes, extract plan from agent's response and store via `setSessionPlan()`.

---

## Server Route Changes

Modify [`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts):

- Accept optional `command?: CommandId` in POST body
- If command is 'implement' (generic), call `classifyImplementationType()`
- Pass command's systemPrompt to `runAgentLoop`

Add `GET /api/commands` endpoint returning available commands for dropdown.

---

## Client Changes

### Store Updates

- `selectedCommand: CommandId | null`
- `availableCommands: CommandOption[]`
- `setSelectedCommand()`, `fetchAvailableCommands()`
- Pass command to API in `sendMessage()`

### UI

- `CommandSelector` dropdown in header (next to ModelSelector)
- Shows: Chat (default), Research, Create Plan, Revise Plan, Implement
