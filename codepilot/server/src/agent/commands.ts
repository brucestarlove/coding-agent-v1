/**
 * Agent Commands
 * Defines workflow modes that modify agent behavior via specialized system prompts.
 * Supports UI selection and natural language detection.
 */

import OpenAI from 'openai';

// ============================================================================
// Types
// ============================================================================

/**
 * Available command IDs
 */
export type CommandId =
  | 'chat'              // Default conversational mode
  | 'research'          // Research Codebase
  | 'create_plan'       // Create Plan
  | 'revise_plan'       // Revise Plan (references session's currentPlan)
  | 'implement_simple'  // Quick implementation (bug fixes, small features)
  | 'implement_complex' // Execute multi-step plan methodically
  | 'implement';        // Generic implement (will be classified to simple/complex)

/**
 * Command definition with metadata and system prompt
 */
export interface AgentCommand {
  id: CommandId;
  name: string;
  description: string;
  /** Regex patterns for natural language detection */
  triggerPatterns: RegExp[];
  /** System prompt for this command mode */
  systemPrompt: string;
  /** Whether this command requires user arguments */
  requiresArgument: boolean;
  /** Whether to show in UI dropdown */
  showInDropdown: boolean;
}

/**
 * Simplified command info for API responses
 */
export interface CommandInfo {
  id: CommandId;
  name: string;
  description: string;
}

// ============================================================================
// System Prompts
// ============================================================================

/**
 * Default chat mode - general coding assistant
 */
const CHAT_SYSTEM_PROMPT = `You are CodePilot, an AI coding assistant that helps developers with their projects.

You have access to tools to interact with the user's codebase:
- read_file: Read file contents
- write_file: Create or overwrite files
- edit_file: Make targeted edits using search/replace
- list_dir: List directory contents
- run_shell: Execute shell commands
- grep: Search for text patterns across files
- find_files: Find files by name pattern (glob)
- git_status, git_diff, git_log: Git operations

When helping users:
1. Read files before modifying them to understand context
2. Use grep and find_files to explore the codebase efficiently
3. Explain what you're doing and why
4. Follow existing code style and conventions
5. Make minimal, focused changes

After completing tasks, summarize what you did and the results.`;

/**
 * Research mode - explore and understand codebase without making changes
 */
const RESEARCH_SYSTEM_PROMPT = `You are CodePilot in RESEARCH MODE. Your task is to explore and understand the codebase thoroughly.

Available tools:
- read_file: Read file contents
- list_dir: List directory contents  
- grep: Search for text patterns across files
- find_files: Find files by name pattern
- run_shell: Execute read-only commands (ls, cat, head, tail, wc, etc.)
- git_status, git_diff, git_log: View git state

IMPORTANT RULES:
1. DO NOT modify any files - this is a research-only session
2. DO NOT use write_file or edit_file
3. Use grep and find_files extensively to understand code structure
4. Read relevant files to understand implementations
5. Look for patterns, dependencies, and architectural decisions

When researching:
- Start with list_dir to understand project structure
- Use find_files to locate relevant files (e.g., "*.ts", "**/*.test.js")
- Use grep to find specific patterns, function usages, imports
- Read key files to understand how things work
- Follow the dependency chain to understand relationships

Provide clear summaries with:
- File references (path and relevant line numbers)
- Code snippets for important findings
- Architectural observations
- Potential areas of concern or interest`;

/**
 * Create Plan mode - analyze and produce a structured implementation plan
 */
const CREATE_PLAN_SYSTEM_PROMPT = `You are CodePilot in PLANNING MODE. Your task is to create a detailed implementation plan.

Available tools (for research):
- read_file, list_dir, grep, find_files
- git_status, git_diff, git_log
- run_shell (read-only commands)

DO NOT modify any files - only research and plan.

Planning process:
1. UNDERSTAND the requirements thoroughly
2. RESEARCH the existing codebase to understand:
   - Current architecture and patterns
   - Files that will need changes
   - Dependencies and potential impacts
3. CREATE a structured plan

Your plan MUST include:
1. **Overview** - Brief summary of what will be done
2. **Files to Modify** - List of files that need changes
3. **Implementation Steps** - Numbered steps with:
   - Clear description of each task
   - Specific files and functions involved
   - Dependencies between steps
4. **Testing Strategy** - How to verify the changes work
5. **Potential Risks** - Edge cases or concerns to watch for

Format the plan in clean Markdown. Be specific and actionable.
The plan should be detailed enough that it could be followed step-by-step.`;

/**
 * Revise Plan mode - modify an existing plan based on feedback
 */
const REVISE_PLAN_SYSTEM_PROMPT = `You are CodePilot in PLAN REVISION MODE. Your task is to revise an existing implementation plan.

Available tools (for research):
- read_file, list_dir, grep, find_files
- git_status, git_diff, git_log

DO NOT modify any files - only revise the plan.

You will be given:
1. The CURRENT PLAN from the session
2. The user's FEEDBACK or requested changes

Revision process:
1. Review the current plan
2. Understand what changes are requested
3. Research if needed (use tools to verify assumptions)
4. Produce an UPDATED PLAN

In your response:
1. Briefly acknowledge what's changing
2. Output the COMPLETE revised plan (not just diffs)
3. Mark changed sections with [UPDATED], [NEW], or [REMOVED] annotations

Keep the same structure and format as the original plan.`;

/**
 * Implement Simple mode - direct implementation without formal planning
 */
const IMPLEMENT_SIMPLE_SYSTEM_PROMPT = `You are CodePilot in IMPLEMENTATION MODE (Simple). Execute the requested changes directly.

Available tools:
- read_file, write_file, edit_file
- list_dir, grep, find_files
- run_shell, git_status, git_diff, git_log

Implementation approach:
1. Read relevant files first to understand context
2. Make focused, minimal changes
3. Use edit_file for targeted modifications (preferred over write_file)
4. Verify changes make sense in context

Guidelines:
- One task at a time
- Don't over-engineer - do exactly what's asked
- Follow existing code style
- Add comments only where helpful
- Test commands if appropriate (npm test, etc.)

After completing:
- Summarize what was changed
- Show relevant diffs if helpful
- Note any follow-up actions needed`;

/**
 * Implement Complex mode - execute a multi-step plan methodically
 */
const IMPLEMENT_COMPLEX_SYSTEM_PROMPT = `You are CodePilot in IMPLEMENTATION MODE (Complex). Execute a multi-step plan methodically.

Available tools:
- read_file, write_file, edit_file
- list_dir, grep, find_files  
- run_shell, git_status, git_diff, git_log

You will be given either:
1. The CURRENT PLAN from the session, OR
2. A plan provided in the user's message

Execution approach:
1. Review the plan to understand all steps
2. Execute steps IN ORDER
3. For each step:
   - Announce: "## Step N: [description]"
   - Research if needed (read files, check state)
   - Make the changes
   - Verify the changes
   - Report: "✓ Step N complete" or "✗ Step N blocked: [reason]"
4. After all steps, provide a summary

If you encounter issues:
- Explain the blocker clearly
- Suggest how to resolve it
- Ask if you should proceed with a modified approach

Guidelines:
- Follow existing code style
- Make changes traceable to plan steps
- Don't skip steps without explanation
- Don't add features not in the plan`;

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * All available agent commands
 */
export const AGENT_COMMANDS: AgentCommand[] = [
  {
    id: 'chat',
    name: 'Chat',
    description: 'General coding assistant (default)',
    triggerPatterns: [],
    systemPrompt: CHAT_SYSTEM_PROMPT,
    requiresArgument: false,
    showInDropdown: true,
  },
  {
    id: 'research',
    name: 'Research Codebase',
    description: 'Explore and understand the codebase',
    triggerPatterns: [
      /^research\s+/i,
      /^explore\s+/i,
      /^understand\s+/i,
      /^analyze\s+/i,
      /^investigate\s+/i,
      /^look\s+into\s+/i,
      /^examine\s+/i,
    ],
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    requiresArgument: true,
    showInDropdown: true,
  },
  {
    id: 'create_plan',
    name: 'Create Plan',
    description: 'Create a structured implementation plan',
    triggerPatterns: [
      /^plan\s+/i,
      /^create\s+(a\s+)?plan\s+/i,
      /^make\s+(a\s+)?plan\s+/i,
      /^design\s+/i,
      /^architect\s+/i,
    ],
    systemPrompt: CREATE_PLAN_SYSTEM_PROMPT,
    requiresArgument: true,
    showInDropdown: true,
  },
  {
    id: 'revise_plan',
    name: 'Revise Plan',
    description: 'Modify an existing plan',
    triggerPatterns: [
      /^revise\s+(the\s+)?plan/i,
      /^update\s+(the\s+)?plan/i,
      /^modify\s+(the\s+)?plan/i,
      /^change\s+(the\s+)?plan/i,
    ],
    systemPrompt: REVISE_PLAN_SYSTEM_PROMPT,
    requiresArgument: true,
    showInDropdown: true,
  },
  {
    id: 'implement',
    name: 'Implement',
    description: 'Implement changes (auto-selects simple or complex)',
    triggerPatterns: [
      /^implement\s+/i,
      /^build\s+/i,
      /^create\s+(?!plan)/i,
      /^add\s+/i,
      /^fix\s+/i,
      /^update\s+(?!plan)/i,
      /^refactor\s+/i,
    ],
    systemPrompt: IMPLEMENT_SIMPLE_SYSTEM_PROMPT, // Default, will be overridden by classifier
    requiresArgument: true,
    showInDropdown: true,
  },
  {
    id: 'implement_simple',
    name: 'Implement (Simple)',
    description: 'Quick implementation for bug fixes, small features',
    triggerPatterns: [],
    systemPrompt: IMPLEMENT_SIMPLE_SYSTEM_PROMPT,
    requiresArgument: true,
    showInDropdown: false, // Hidden from dropdown, used internally
  },
  {
    id: 'implement_complex',
    name: 'Implement (Complex)',
    description: 'Execute a multi-step plan methodically',
    triggerPatterns: [
      /^implement\s+(the\s+)?plan/i,
      /^execute\s+(the\s+)?plan/i,
      /^run\s+(the\s+)?plan/i,
      /^follow\s+(the\s+)?plan/i,
    ],
    systemPrompt: IMPLEMENT_COMPLEX_SYSTEM_PROMPT,
    requiresArgument: false, // Can use session's currentPlan
    showInDropdown: false, // Hidden from dropdown, used internally
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get command by ID
 */
export function getCommand(id: CommandId): AgentCommand | undefined {
  return AGENT_COMMANDS.find((cmd) => cmd.id === id);
}

/**
 * Get commands for dropdown display
 */
export function getDropdownCommands(): CommandInfo[] {
  return AGENT_COMMANDS
    .filter((cmd) => cmd.showInDropdown)
    .map((cmd) => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
    }));
}

/**
 * Get system prompt for a command, with optional plan injection
 */
export function getSystemPrompt(commandId: CommandId, currentPlan?: string | null): string {
  const command = getCommand(commandId);
  if (!command) {
    return CHAT_SYSTEM_PROMPT;
  }

  let prompt = command.systemPrompt;

  // Inject current plan for revise_plan and implement_complex
  if (currentPlan && (commandId === 'revise_plan' || commandId === 'implement_complex')) {
    prompt += `\n\n---\n\n## CURRENT PLAN\n\n${currentPlan}`;
  }

  return prompt;
}

// ============================================================================
// Natural Language Detection
// ============================================================================

/**
 * Result of command detection
 */
export interface DetectionResult {
  command: AgentCommand;
  /** Message with trigger phrase removed (if applicable) */
  cleanedMessage: string;
}

/**
 * Detect command from message using trigger patterns
 * Returns null if no command detected (defaults to 'chat')
 */
export function detectCommand(message: string): DetectionResult | null {
  const trimmed = message.trim();

  for (const command of AGENT_COMMANDS) {
    for (const pattern of command.triggerPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        // Remove the matched trigger phrase from the message
        const cleanedMessage = trimmed.slice(match[0].length).trim();
        return { command, cleanedMessage };
      }
    }
  }

  return null;
}

/**
 * Check if message looks like a pasted plan
 * Used to help determine implement_complex vs implement_simple
 */
export function detectPastedPlan(message: string): boolean {
  // Check for markdown plan indicators
  const hasNumberedSteps = (message.match(/^\d+\.\s+/gm) || []).length >= 3;
  const hasPlanHeaders = /^##?\s+(overview|plan|implementation|steps|files)/im.test(message);
  const hasCheckboxes = (message.match(/^-\s+\[[ x]\]/gm) || []).length >= 2;

  return hasNumberedSteps || hasPlanHeaders || hasCheckboxes;
}

// ============================================================================
// LLM-Based Classification
// ============================================================================

/**
 * Classify implementation request as simple or complex using LLM
 * Uses a fast model (Haiku) for quick classification
 */
export async function classifyImplementationType(
  message: string,
  hasCurrentPlan: boolean
): Promise<'simple' | 'complex'> {
  // Quick heuristics first - skip LLM call for clear cases
  
  // Explicit plan references -> complex
  if (/implement\s+(the\s+)?plan/i.test(message) || 
      /execute\s+(the\s+)?plan/i.test(message) ||
      /follow\s+(the\s+)?plan/i.test(message)) {
    return 'complex';
  }

  // Pasted plan in message -> complex
  if (detectPastedPlan(message)) {
    return 'complex';
  }

  // Simple trigger phrases -> simple
  if (/^fix\s+(the\s+)?(bug|issue|error|problem)/i.test(message) ||
      /^add\s+(a\s+)?(button|field|method|function|test)/i.test(message) ||
      /^update\s+(the\s+)?(text|label|style|color)/i.test(message)) {
    return 'simple';
  }

  // For ambiguous cases, use LLM classification
  try {
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      // Fallback to heuristics if no API key
      return hasCurrentPlan ? 'complex' : 'simple';
    }

    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openRouterApiKey,
    });

    // Use fast model for classification
    const haikuModel = process.env.OPENROUTER_MODEL_HAIKU || 'anthropic/claude-3-5-haiku-20241022';

    const response = await client.chat.completions.create({
      model: haikuModel,
      messages: [
        {
          role: 'user',
          content: `Classify this implementation request as SIMPLE or COMPLEX.

SIMPLE: Bug fixes, small features, single-file changes, straightforward tasks, clear instructions that can be done directly without a plan.

COMPLEX: Multi-step plans, large refactors, cross-file changes, tasks requiring systematic approach, contains numbered steps or checklist items, references an existing plan.

${hasCurrentPlan ? 'Note: User has an existing plan in this session.' : ''}

User request:
"""
${message.slice(0, 500)}
"""

Reply with ONLY one word: SIMPLE or COMPLEX`,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || '';
    return answer.includes('COMPLEX') ? 'complex' : 'simple';
  } catch (error) {
    console.error('[Commands] Classification error:', error);
    // Fallback: if there's a plan, assume complex
    return hasCurrentPlan ? 'complex' : 'simple';
  }
}

/**
 * Resolve the final command to use, including classification for 'implement'
 */
export async function resolveCommand(
  commandId: CommandId | null,
  message: string,
  hasCurrentPlan: boolean
): Promise<{ command: AgentCommand; cleanedMessage: string }> {
  let effectiveCommandId = commandId;
  let cleanedMessage = message;

  // If no explicit command, try to detect from message
  if (!effectiveCommandId) {
    const detection = detectCommand(message);
    if (detection) {
      effectiveCommandId = detection.command.id;
      cleanedMessage = detection.cleanedMessage;
    } else {
      effectiveCommandId = 'chat';
    }
  }

  // If command is generic 'implement', classify as simple or complex
  if (effectiveCommandId === 'implement') {
    const type = await classifyImplementationType(cleanedMessage, hasCurrentPlan);
    effectiveCommandId = type === 'complex' ? 'implement_complex' : 'implement_simple';
  }

  const command = getCommand(effectiveCommandId) || getCommand('chat')!;
  return { command, cleanedMessage };
}

