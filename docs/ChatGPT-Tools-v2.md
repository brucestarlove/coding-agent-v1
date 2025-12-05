Here’s a concrete implementation plan for a **provider-agnostic tool layer + per-provider adapters**, wired up to **Claude’s advanced tool use (Tool Search, Programmatic Tool Calling, Tool Use Examples)**—but only implementing the Claude adapter for now.

I’ll lay it out as phases you can actually build.

---

## 0. High-level shape

We’ll build:

* A **core, provider-agnostic tool layer**
  – Unified `ToolDefinition`, `ToolRegistry`, `ToolInvocation`, `ToolResult`
  – Zero dependence on Claude / OpenAI / etc.

* A **provider adapter interface**
  – `ProviderAdapter` that takes core tools + messages and talks to a specific LLM provider.

* A **ClaudeAdapter** that:

  * Uses Anthropic TS SDK’s `beta.messages.create` / streaming. ([GitHub][1])
  * Enables **Tool Search Tool** (`tool_search_tool_bm25_20251119` + `defer_loading`) ([Claude][2])
  * Enables **Programmatic Tool Calling** via `code_execution_20250825` + `allowed_callers` ([Anthropic][3])
  * Optionally uses **Tool Use Examples** via `input_examples` when Tool Search is disabled. ([Anthropic][3])

---

## 1. Project structure

Something like:

```text
src/
  core/
    tools/
      types.ts
      registry.ts
      executor.ts        // runs handlers
  providers/
    types.ts             // ProviderAdapter interface
    claude/
      claudeAdapter.ts
      claudeMapping.ts   // helper: map core tools -> Claude tools[]
  agent/
    types.ts             // generic AgentMessage, ToolInvocation, ToolResult
    runAgent.ts          // generic agent loop using a ProviderAdapter
examples/
  codingAgent.ts         // wiring a coding agent with ClaudeAdapter
```

---

## 2. Core provider-agnostic tool layer

### 2.1 Core types

Use JSON Schema for inputs so you can map to any provider.

```ts
// core/tools/types.ts
import type { JSONSchema7 } from 'json-schema';

export type ProviderId = 'claude' | 'openai' | 'vertex' | 'local';

export interface ToolExecutionContext {
  correlationId?: string;
  // add things like cwd, userId, logger, etc.
}

export interface ToolMetadata {
  /** Mark as frequently used → don't defer loading for providers that support it. */
  highFrequency?: boolean;

  /** Allow provider-specific "programmatic" calling from code. */
  programmaticFrom?: ('code_execution')[];

  /** Examples for schema usage – mapped to provider-specific fields (e.g. input_examples). */
  inputExamples?: unknown[];
}

export interface BaseToolDefinition<I = unknown, O = unknown> {
  /** Global canonical name (provider-agnostic). */
  name: string;
  description: string;
  inputSchema: JSONSchema7;

  /** Actual implementation on your side. */
  handler: (input: I, ctx: ToolExecutionContext) => Promise<O>;

  metadata?: ToolMetadata;
}
```

### 2.2 Tool registry

Simple in-memory registry, used by all providers.

```ts
// core/tools/registry.ts
import { BaseToolDefinition } from './types';

export class ToolRegistry {
  private tools = new Map<string, BaseToolDefinition>();

  register(tool: BaseToolDefinition) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name ${tool.name} already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): BaseToolDefinition[] {
    return [...this.tools.values()];
  }

  get(name: string): BaseToolDefinition | undefined {
    return this.tools.get(name);
  }
}
```

### 2.3 Generic tool executor

```ts
// core/tools/executor.ts
import { ToolRegistry } from './registry';
import { ToolExecutionContext } from './types';

export interface ToolInvocation {
  id: string;
  name: string;
  input: unknown;
  caller?: { type: string; toolId?: string }; // for programmatic caller metadata
}

export interface ToolResult {
  id: string;
  name: string;
  /** Raw result from handler; provider adapter will wrap/serialize. */
  value: unknown;
  error?: Error;
}

export async function executeInvocations(
  registry: ToolRegistry,
  invocations: ToolInvocation[],
  ctx: ToolExecutionContext
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const inv of invocations) {
    const def = registry.get(inv.name);
    if (!def) {
      results.push({
        id: inv.id,
        name: inv.name,
        value: null,
        error: new Error(`Unknown tool: ${inv.name}`),
      });
      continue;
    }

    try {
      const value = await def.handler(inv.input as any, ctx);
      results.push({ id: inv.id, name: inv.name, value });
    } catch (err: any) {
      results.push({
        id: inv.id,
        name: inv.name,
        value: null,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return results;
}
```

---

## 3. Provider abstraction

### 3.1 Messages & provider adapter types

We keep a simple, provider-agnostic message type. Each adapter converts this to its provider’s format.

```ts
// agent/types.ts
export type CoreRole = 'system' | 'user' | 'assistant';

export interface CoreTextBlock {
  type: 'text';
  text: string;
}

export interface CoreToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  payload: unknown;
}

export type CoreContentBlock = CoreTextBlock | CoreToolResultBlock;

export interface CoreMessage {
  role: CoreRole;
  content: CoreContentBlock[];
}

// providers/types.ts
import { BaseToolDefinition } from '../core/tools/types';
import { CoreMessage } from '../agent/types';
import { ToolInvocation, ToolResult } from '../core/tools/executor';

export interface ProviderTurnResult {
  messagesToAppend: CoreMessage[];
  toolInvocations: ToolInvocation[];
  /** Did the model finish (no more tool calls needed)? */
  done: boolean;
}

export interface ProviderAdapter {
  id: string; // 'claude', 'openai', ...

  sendTurn(params: {
    messages: CoreMessage[];
    tools: BaseToolDefinition[];
  }): Promise<ProviderTurnResult>;
}
```

---

## 4. Claude adapter (advanced tool use)

We now implement `ProviderAdapter` **specifically for Claude**, mapping to:

* **Tool Search Tool** (`tool_search_tool_regex_20251119` / `tool_search_tool_bm25_20251119` + `defer_loading`) ([Claude][2])
* **Code Execution** (`code_execution_20250825` + `betas=["code-execution-2025-08-25"]`) ([Anthropic][3])
* **Advanced Tool Use** (`betas=["advanced-tool-use-2025-11-20"]`) ([Anthropic][3])
* **Tool Use Examples** (`input_examples`), but only when Tool Search is **not** enabled (docs say Tool Search is incompatible with tool use examples). ([Claude][2])

### 4.1 Constants

```ts
// providers/claude/claudeMapping.ts
export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

export const BETA_ADVANCED_TOOL_USE = 'advanced-tool-use-2025-11-20';
export const BETA_CODE_EXECUTION = 'code-execution-2025-08-25';

export const CLAUDE_TOOL_SEARCH_BM25_TYPE = 'tool_search_tool_bm25_20251119';
export const CLAUDE_TOOL_SEARCH_BM25_NAME = 'tool_search_tool_bm25';

export const CLAUDE_CODE_EXECUTION_TYPE = 'code_execution_20250825';
export const CLAUDE_CODE_EXECUTION_NAME = 'code_execution';
```

### 4.2 Mapping core tools → Claude `tools[]`

We want:

* `input_schema` rather than `inputSchema`
* `defer_loading` based on `metadata.highFrequency`
* `allowed_callers: ["code_execution_20250825"]` for tools that can be called programmatically from code execution. ([Anthropic][3])
* optionally `input_examples` when we are not using Tool Search Tool (because of the incompatibility). ([Claude][2])

```ts
// providers/claude/claudeMapping.ts
import { BaseToolDefinition } from '../../core/tools/types';
import {
  CLAUDE_TOOL_SEARCH_BM25_TYPE,
  CLAUDE_TOOL_SEARCH_BM25_NAME,
  CLAUDE_CODE_EXECUTION_TYPE,
  CLAUDE_CODE_EXECUTION_NAME,
} from './claudeMapping';

type ClaudeToolDef = {
  name: string;
  description?: string;
  input_schema?: any;
  defer_loading?: boolean;
  allowed_callers?: string[];
  input_examples?: unknown[];
  // plus the special server-side tools:
  type?: string;
};

interface ClaudeToolBuildOptions {
  useToolSearch: boolean;
  includeCodeExecution: boolean;
}

export function buildClaudeTools(
  tools: BaseToolDefinition[],
  opts: ClaudeToolBuildOptions
): ClaudeToolDef[] {
  const out: ClaudeToolDef[] = [];

  // 1. Tool Search Tool (if enabled)
  if (opts.useToolSearch) {
    out.push({
      type: CLAUDE_TOOL_SEARCH_BM25_TYPE,
      name: CLAUDE_TOOL_SEARCH_BM25_NAME,
    });
  }

  // 2. Code Execution Tool (if enabled)
  if (opts.includeCodeExecution) {
    out.push({
      type: CLAUDE_CODE_EXECUTION_TYPE,
      name: CLAUDE_CODE_EXECUTION_NAME,
    });
  }

  // 3. User tools
  const nonDeferredMustExist = tools.some(t => t.metadata?.highFrequency);
  for (const t of tools) {
    const deferLoading =
      opts.useToolSearch
        ? !(t.metadata?.highFrequency ?? false)
        : undefined; // no deferral when not using Tool Search

    const allowedCallers =
      t.metadata?.programmaticFrom?.includes('code_execution') && opts.includeCodeExecution
        ? [CLAUDE_CODE_EXECUTION_TYPE]
        : undefined;

    const input_examples =
      // Tool Search Tool is incompatible with tool use examples in Claude
      // so only attach examples if Tool Search is disabled
      !opts.useToolSearch ? t.metadata?.inputExamples : undefined;

    out.push({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      defer_loading: deferLoading,
      allowed_callers: allowedCallers,
      input_examples,
    });
  }

  // Safety: if using Tool Search, ensure at least one tool is non-deferred
  if (opts.useToolSearch && !nonDeferredMustExist && tools.length > 0) {
    out[ out.length - 1 ].defer_loading = false;
  }

  return out;
}
```

This uses the Claude docs semantics:

* `tool_search_tool_bm25_20251119` as server-side search; deferred tools are discovered and expanded automatically by the API. ([Claude][2])
* `allowed_callers: ["code_execution_20250825"]` to opt tools into Programmatic Tool Calling. ([Anthropic][3])

### 4.3 ClaudeAdapter implementation

```ts
// providers/claude/claudeAdapter.ts
import Anthropic from '@anthropic-ai/sdk';
import { ProviderAdapter, ProviderTurnResult } from '../types';
import { BaseToolDefinition } from '../../core/tools/types';
import { CoreMessage } from '../../agent/types';
import { ToolInvocation } from '../../core/tools/executor';
import {
  buildClaudeTools,
  CLAUDE_MODEL,
  BETA_ADVANCED_TOOL_USE,
  BETA_CODE_EXECUTION,
  CLAUDE_CODE_EXECUTION_TYPE,
} from './claudeMapping';

export interface ClaudeAdapterOptions {
  model?: string;
  useToolSearch?: boolean;
  includeCodeExecution?: boolean;
}

export class ClaudeAdapter implements ProviderAdapter {
  public readonly id = 'claude';

  private client: Anthropic;
  private opts: Required<ClaudeAdapterOptions>;

  constructor(client: Anthropic, opts?: ClaudeAdapterOptions) {
    this.client = client;
    this.opts = {
      model: opts?.model ?? CLAUDE_MODEL,
      useToolSearch: opts?.useToolSearch ?? true,
      includeCodeExecution: opts?.includeCodeExecution ?? true,
    };
  }

  async sendTurn(params: {
    messages: CoreMessage[];
    tools: BaseToolDefinition[];
  }): Promise<ProviderTurnResult> {
    const claudeTools = buildClaudeTools(params.tools, {
      useToolSearch: this.opts.useToolSearch,
      includeCodeExecution: this.opts.includeCodeExecution,
    });

    const claudeMessages = this.toClaudeMessages(params.messages);

    const response = await this.client.beta.messages.create({
      model: this.opts.model,
      max_tokens: 2048,
      messages: claudeMessages,
      tools: claudeTools as any,
      betas: [BETA_ADVANCED_TOOL_USE, BETA_CODE_EXECUTION],
    });

    const { messagesToAppend, toolInvocations, done } =
      this.fromClaudeResponse(response);

    return { messagesToAppend, toolInvocations, done };
  }

  private toClaudeMessages(messages: CoreMessage[]): any[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        }
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            content: block.payload,
          };
        }
      }),
    }));
  }

  private fromClaudeResponse(response: any): {
    messagesToAppend: CoreMessage[];
    toolInvocations: ToolInvocation[];
    done: boolean;
  } {
    const toolInvocations: ToolInvocation[] = [];
    const assistantContentBlocks: any[] = response.content ?? [];
    const messagesToAppend: CoreMessage[] = [];

    const assistantBlocksToKeep: any[] = [];

    for (const block of assistantContentBlocks) {
      if (block.type === 'text') {
        assistantBlocksToKeep.push(block);
      } else if (block.type === 'tool_use') {
        toolInvocations.push({
          id: block.id,
          name: block.name,
          input: block.input,
          caller: block.caller, // may be { type: "code_execution_20250825", tool_id: ... }
        });
      } else if (block.type === 'server_tool_use') {
        // Tool Search Tool or Code Execution code block; keep it in transcript
        assistantBlocksToKeep.push(block);
      } else if (block.type === 'tool_result') {
        // server-side tool results (e.g., tool_search tool_references, code_execution final output)
        assistantBlocksToKeep.push(block);
      }
    }

    if (assistantBlocksToKeep.length > 0) {
      messagesToAppend.push({
        role: 'assistant',
        content: assistantBlocksToKeep.map(b => {
          if (b.type === 'text') {
            return { type: 'text', text: b.text };
          }
          // you can add richer mapping here if you want these blocks visible in your UI
          return { type: 'text', text: JSON.stringify(b) } as any;
        }),
      });
    }

    const done = response.stop_reason !== 'tool_use';

    return { messagesToAppend, toolInvocations, done };
  }
}
```

Notes:

* When Claude uses **Tool Search Tool**, you’ll see `server_tool_use` + `tool_result` with `tool_reference` in the response; the API auto-expands these references into full tool definitions and then emits `tool_use` blocks for discovered tools. You don’t have to manually expand them. ([Claude][2])
* When using **Programmatic Tool Calling**, tool calls generated from within the code execution environment include a `caller` field with `type: "code_execution_20250825"` and `tool_id` pointing to that code execution call. ([Anthropic][3])

---

## 5. Generic agent loop using the adapter

Now we plug everything together: the core registry + executor + ClaudeAdapter.

```ts
// agent/runAgent.ts
import { CoreMessage } from './types';
import { ProviderAdapter } from '../providers/types';
import { ToolRegistry } from '../core/tools/registry';
import { executeInvocations } from '../core/tools/executor';

export async function runAgentTurnLoop(opts: {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  initialMessages: CoreMessage[];
  maxTurns?: number;
}) {
  const messages: CoreMessage[] = [...opts.initialMessages];
  const maxTurns = opts.maxTurns ?? 16;

  for (let i = 0; i < maxTurns; i++) {
    const tools = opts.registry.list();

    const { messagesToAppend, toolInvocations, done } =
      await opts.adapter.sendTurn({ messages, tools });

    messages.push(...messagesToAppend);

    if (toolInvocations.length === 0) {
      if (done) break;
      continue;
    }

    // Execute tool invocations with your own handlers
    const toolResults = await executeInvocations(
      opts.registry,
      toolInvocations,
      {}
    );

    // Feed tool_result blocks back into the conversation
    messages.push({
      role: 'user',
      content: toolResults.map(tr => ({
        type: 'tool_result',
        toolUseId: tr.id,
        payload: tr.error ? { error: String(tr.error) } : tr.value,
      })),
    });

    if (done) break;
  }

  return messages;
}
```

This loop:

* Sends messages + unified tools to **ClaudeAdapter**.
* Sees any `tool_use` blocks and executes them with your own handlers.
* Returns `tool_result` blocks back to Claude, which will either:

  * Continue normal tool-driven reasoning, or
  * If the call originated from **Code Execution**, those results are processed in the sandbox, and Claude only sees the **final** program output, as described in the Programmatic Tool Calling docs. ([Anthropic][3])

---

## 6. Example: Coding agent wired to Claude

Finally, define some concrete tools with metadata:

```ts
// examples/codingAgent.ts
import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from '../core/tools/registry';
import { runAgentTurnLoop } from '../agent/runAgent';
import { ClaudeAdapter } from '../providers/claude/claudeAdapter';
import type { BaseToolDefinition } from '../core/tools/types';

const registry = new ToolRegistry();

// read_file tool (frequently used, callable from code)
const readFileTool: BaseToolDefinition<{ path: string }, string> = {
  name: 'read_file',
  description: 'Read file contents from the local filesystem',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  async handler({ path }) {
    const fs = await import('fs/promises');
    return await fs.readFile(path, 'utf8');
  },
  metadata: {
    highFrequency: true,
    programmaticFrom: ['code_execution'],
    // Note: these examples will be ignored if Tool Search is enabled
    inputExamples: [{ path: 'src/auth.ts' }],
  },
};

registry.register(readFileTool);

// Add write_file, run_tests, git_commit, etc. with similar metadata

async function main() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const adapter = new ClaudeAdapter(client, {
    useToolSearch: true,          // enable server-side tool search
    includeCodeExecution: true,   // enable Programmatic Tool Calling
  });

  const initialMessages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Refactor the authentication logic in src/auth.ts to support OAuth2.',
        },
      ],
    },
  ];

  const finalMessages = await runAgentTurnLoop({
    adapter,
    registry,
    initialMessages,
    maxTurns: 24,
  });

  console.log(
    finalMessages
      .filter(m => m.role === 'assistant')
      .map(m => m.content.map(b => (b.type === 'text' ? b.text : '')))
      .join('\n\n')
  );
}

main().catch(console.error);
```

This gives you:

* A **provider-agnostic tool registry & executor**.
* A **Claude-specific adapter** that:

  * Adds **Tool Search Tool** + `defer_loading` for large catalogs. ([Claude][2])
  * Uses **Code Execution** for Programmatic Tool Calling via `allowed_callers`. ([Anthropic][3])
  * Optionally uses **Tool Use Examples** when you flip `useToolSearch: false`.
* A **generic agent loop** you can reuse for other providers later.

When you’re ready to support another LLM, you just:

1. Implement a new `ProviderAdapter` that:

   * Maps `BaseToolDefinition` → that provider’s `tools` format.
   * Parses that provider’s tool-call response format → `ToolInvocation[]`.
2. Plug it into the **same** tool registry + agent loop.

You get the benefits of Claude’s advanced tool use today, while keeping the whole tool system portable to other providers tomorrow.

[1]: https://github.com/anthropics/anthropic-sdk-typescript "GitHub - anthropics/anthropic-sdk-typescript: Access to Anthropic's safety-first language model APIs in TypeScript"
[2]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool "Tool search tool - Claude Docs"
[3]: https://www.anthropic.com/engineering/advanced-tool-use "Introducing advanced tool use on the Claude Developer Platform \ Anthropic"
