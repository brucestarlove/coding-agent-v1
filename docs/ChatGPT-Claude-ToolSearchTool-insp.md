me: Extract from this how I would implement similarly the new Tool Search Tool, Programmatic Tool Calling and Tool Use Examples https://www.anthropic.com/engineering/advanced-tool-use

ChatGPT:
Here’s the distilled “how to actually build this yourself” version of that article, mapped to how you’d implement **Tool Search**, **Programmatic Tool Calling**, and **Tool Use Examples** in your own agent harness (or on top of Claude if you want to use their beta).

I’ll first give you the *patterns*, then concrete TypeScript-ish sketches.

---

## 0. Mental model of the three things

From the article, the three features really boil down to: ([Anthropic][1])

* **Tool Search Tool**

  > Don’t shove 100+ tool schemas into the prompt. Store them off-prompt and give the model *one* search tool that returns only a few relevant tool definitions on demand.

* **Programmatic Tool Calling**

  > Don’t have the model call tools step-by-step through natural-language. Let it write code (Python in their case) that calls tools, loops, aggregates, filters, and only sends the *final* result back into the model’s context. ([Anthropic][1])

* **Tool Use Examples**

  > JSON Schema says what’s *valid*, but not what’s *normal*. Attach a few real examples of good tool calls so the model learns conventions: date formats, when to include nested fields, etc. ([Anthropic][1])

You can implement analogous things in your own stack (Starscape agents, MCP harness, etc.) like this:

---

## 1. Implementing a “Tool Search Tool”

### 1.1. Data model: a tool registry

Have a central registry of all tools, not all of which are loaded into the model at once.

Conceptually:

```ts
type ToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  // NEW:
  deferLoading?: boolean;       // analogous to defer_loading: true :contentReference[oaicite:3]{index=3}
  inputExamples?: any[];        // we’ll use this in section 3
};

const TOOL_REGISTRY: ToolSchema[] = [
  {
    name: "github.createPullRequest",
    description: "Create a pull request",
    inputSchema: {/* ... */},
    deferLoading: true,
  },
  // … hundreds more
];
```

Anthropic’s API literally uses `defer_loading: true` on the tool definitions they send, and only sends the Tool Search Tool itself + a few always-on tools. ([Anthropic][1])

You’re doing the same thing logically: tools exist in your registry, but not all are in the LLM’s `tools` array up front.

---

### 1.2. Search index over tools

You then build a search index over `(name + description + tags)`. Anthropic ships BM25 / regex search tools by default; you can approximate with: ([Anthropic][1])

* Postgres full-text
* Meilisearch
* Elastic
* Or a lil’ in-memory BM25 / TF-IDF or embeddings index.

Pseudo:

```ts
function searchTools(query: string, topK = 5): ToolSchema[] {
  // naive version: rank by simple text similarity
  const scored = TOOL_REGISTRY.map(tool => ({
    tool,
    score: simpleSimilarity(query, `${tool.name} ${tool.description}`),
  }));
  return scored
    .filter(({ tool }) => tool.deferLoading) // only search deferred tools
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(x => x.tool);
}
```

---

### 1.3. Expose a single “tool_search” tool to the model

You then expose **one** tool to the model:

```ts
const TOOL_SEARCH_TOOL = {
  name: "tool_search",
  description: "Search for tools by capability or name. Returns tool definitions you can then call.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      top_k: { type: "integer", default: 5 },
    },
    required: ["query"],
  },
};
```

When the model calls `tool_search`, *your* backend implements it by querying the index and returning the matching tool definitions:

```ts
async function handleToolSearch(input: { query: string; top_k?: number }) {
  const results = searchTools(input.query, input.top_k ?? 5);

  return {
    tools: results.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      // you can also include examples here
      input_examples: t.inputExamples ?? [],
    })),
  };
}
```

Anthropic’s implementation conceptually does the same: Claude calls a `tool_search_tool_*` tool; the platform returns references, and those tools are then “expanded” into full tool definitions in context. ([Anthropic][1])

---

### 1.4. Orchestration loop

Your agent loop looks roughly like:

1. Start conversation with:

   * System prompt
   * A small set of always-on tools (`deferLoading: false`)
   * The `tool_search` tool

2. When you see a `tool_search` tool call in the streaming output:

   * Run your `handleToolSearch` implementation
   * Add the returned tools to the model’s `tools` array for the *next* call
   * Ask the model again with something like: “Here are the tools you found; proceed.”

Pseudo-flow:

```ts
let loadedTools = [TOOL_SEARCH_TOOL, ...ALWAYS_ON_TOOLS];

while (true) {
  const response = await llm.chat({
    messages,
    tools: loadedTools,
    // tool_choice: "auto" / whatever
  });

  streamToUI(response); // your “streaming tool calls” requirement

  if (response.toolCalls.length === 0) break;

  for (const call of response.toolCalls) {
    if (call.name === "tool_search") {
      const { tools } = await handleToolSearch(call.input);
      loadedTools = [...loadedTools, ...tools];   // dynamically extend
      messages.push({ role: "tool", name: call.name, content: tools });
    } else {
      // normal tool execution
      const result = await runActualTool(call);
      messages.push({ role: "tool", name: call.name, content: result });
    }
  }
}
```

That’s the essence of the article’s Tool Search Tool idea: **“defer” most tools, and give the model a meta-tool that fetches only what it needs.** ([Anthropic][1])

---

## 2. Implementing “Programmatic Tool Calling”

Anthropic’s pattern: give the model a **code execution tool** (Python sandbox) and let it write orchestration code that calls tools as functions; the intermediate data lives in the sandbox, not the LLM context. ([Anthropic][1])

You can mirror this with JS or Python.

### 2.1. Provide a `code_execution` tool

Define a tool like:

```ts
const CODE_EXECUTION_TOOL = {
  name: "code_execution",
  description: "Run JS/Python code to orchestrate tools and aggregate results.",
  input_schema: {
    type: "object",
    properties: {
      code: { type: "string" },
    },
    required: ["code"],
  },
};
```

And mark which tools are callable *from code* (Anthropic uses `allowed_callers: ["code_execution_..."]`). ([Anthropic][1])

```ts
type CallableTool = ToolSchema & {
  allowedCallers?: string[]; // e.g. ["code_execution"]
};
```

---

### 2.2. Code execution sandbox with tool stubs

When the model calls `code_execution` with some JS or Python, you run that in a sandbox *where tools are provided as async functions that call back to your infra*.

For example, JS sandbox pseudo:

```ts
async function runCodeExecution(code: string, callableTools: CallableTool[]) {
  // create a map of tool stubs that call your backend
  const toolFns: Record<string, Function> = {};
  for (const tool of callableTools) {
    if (tool.allowedCallers?.includes("code_execution")) {
      toolFns[tool.name] = async (input: any) => {
        // You decide the protocol here
        const result = await runActualTool({ name: tool.name, input });
        return result;
      };
    }
  }

  // Use something like vm2, SES, or your own WASM sandbox
  const sandboxResult = await runInSandbox({
    code,
    globals: toolFns,
  });

  return sandboxResult; // stdout / return value
}
```

From the model’s perspective, it writes code like: ([Anthropic][1])

```python
team = await get_team_members("engineering")
levels = list(set(m["level"] for m in team))
# ...
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])
# aggregate & print only exceeded users
```

In your JS world, you might encourage it to write:

```js
const team = await get_team_members("engineering");
const levels = [...new Set(team.map(m => m.level))];
// etc.
```

Your sandbox intercepts calls to `get_team_members`, `get_expenses`, etc., and calls your real APIs, returning JSON. All the big intermediate arrays live in the sandbox memory, not the LLM context.

---

### 2.3. Wiring it into the agent loop

Flow is:

1. Model decides to use `code_execution` and emits a tool call with `input.code`.
2. You run `runCodeExecution(code, callableTools)`:

   * Each time the code calls one of your tool stubs, your infra executes that tool and returns JSON.
   * The code aggregates, filters, etc.
3. When the code finishes, you send *only the final result* back to the model as the tool result.

Pseudo:

```ts
if (toolCall.name === "code_execution") {
  const stdout = await runCodeExecution(toolCall.input.code, TOOL_REGISTRY);

  messages.push({
    role: "tool",
    name: "code_execution",
    content: { stdout },
  });

  continue; // let the model see the summary and respond
}
```

This mirrors Anthropic’s behavior: code_execution tool runs, tool calls are processed *without going back to the model each time*, and when it’s done, only the final output goes back into context. ([Anthropic][1])

---

## 3. Implementing “Tool Use Examples”

Tool Use Examples are just: “attach 1–5 high-quality example inputs for each non-trivial tool and send them to the model with the schema.” ([Anthropic][1])

### 3.1. Extend your tool schema

```ts
type ToolSchema = {
  name: string;
  description: string;
  inputSchema: any;
  deferLoading?: boolean;
  inputExamples?: any[];  // NEW
};
```

And then actually fill them:

```ts
const createTicketTool: ToolSchema = {
  name: "create_ticket",
  description: "Create a customer support ticket",
  inputSchema: { /* JSON Schema */ },
  inputExamples: [
    {
      title: "Login page returns 500 error",
      priority: "critical",
      labels: ["bug", "authentication", "production"],
      reporter: {
        id: "USR-12345",
        name: "Jane Smith",
        contact: { email: "jane@acme.com", phone: "+1-555-0123" },
      },
      due_date: "2024-11-06",
      escalation: { level: 2, notify_manager: true, sla_hours: 4 },
    },
    {
      title: "Add dark mode support",
      labels: ["feature-request", "ui"],
      reporter: { id: "USR-67890", name: "Alex Chen" },
    },
    { title: "Update API documentation" },
  ],
};
```

That’s almost verbatim what the article shows. ([Anthropic][1])

When you send the tool definition to the LLM, include `input_examples` with it. The model then infers:

* “Oh, dates should be YYYY-MM-DD.”
* “IDs are like `USR-12345`.”
* “Critical bugs include escalation; feature requests don’t.” ([Anthropic][1])

For your own tools (e.g. “create_orbit”, “schedule_clip_render”, “link_github_repo”), do the same: realistic, short, 2–5 variants.

---

## 4. How to layer these in your own system

Based on the “Best practices” section: ([Anthropic][1])

* If your bottleneck is **tool schema/context bloat** → build Tool Search Tool (`deferLoading`, tool index, search meta-tool).
* If your bottleneck is **huge intermediate data** → add Programmatic Tool Calling (`code_execution` tool + sandbox).
* If your bottleneck is **parameter mistakes / malformed calls** → add Tool Use Examples (`inputExamples` on tools).
