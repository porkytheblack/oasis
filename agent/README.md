# @oasis/agent

Agent skill for [Oasis](https://github.com/porkytheblack/oasis) — enables AI agents to report feedback, errors, and execution context to an Oasis server.

Designed for integration into agent workflows, tool chains, and multi-agent systems. Node.js-native with zero browser dependencies.

## Installation

```bash
npm install @oasis/agent
```

## Quick Start

```typescript
import { initOasisAgent } from "@oasis/agent";

const agent = initOasisAgent({
  apiKey: "pk_my-app_a1b2c3d4e5f6g7h8",
  serverUrl: "https://updates.myapp.com",
  appVersion: "1.0.0",
  agentName: "code-review-agent",
  agentModel: "claude-3",
});

// Track execution steps
agent.breadcrumbs.addStep("analyze", "Analyzing repository structure");
agent.breadcrumbs.addToolCall("file-read", { path: "src/index.ts" });
agent.breadcrumbs.addToolResult("file-read", true, "Read 150 lines");

// Report errors
try {
  await riskyOperation();
} catch (error) {
  await agent.errors.captureException(error, {
    stepName: "code-generation",
    severity: "error",
  });
}

// Submit feedback
await agent.feedback.reportAgentIssue("Model produced invalid JSON output", {
  input: prompt,
  output: response,
});

// Clean up when done
agent.destroy();
```

## Configuration

```typescript
const agent = initOasisAgent({
  // Required
  apiKey: "pk_my-app_a1b2c3d4e5f6g7h8", // Oasis public API key
  serverUrl: "https://updates.myapp.com", // Oasis server URL
  appVersion: "1.0.0", // Your agent/app version
  agentName: "my-agent", // Agent identifier

  // Optional
  agentModel: "claude-3", // Model or framework name
  timeout: 10000, // API request timeout (ms)
  maxBreadcrumbs: 100, // Max breadcrumbs to keep
  debug: false, // Enable debug logging
  beforeSend: (event) => event, // Hook to filter/modify events
  onError: (error, event) => {}, // Error callback
});
```

## Features

### Error Reporting

Report errors from agent execution with full context — stack traces, execution state, breadcrumbs, and agent metadata are captured automatically.

```typescript
// Capture any exception
await agent.errors.captureException(error, {
  stepName: "data-extraction",
  severity: "error",
  executionState: { query: "SELECT ..." },
});

// Report tool failures
await agent.errors.reportToolFailure("database-query", error, {
  query: "SELECT * FROM users",
});

// Report step failures
await agent.errors.reportStepFailure("deploy", error, {
  environment: "staging",
});

// Full control with report()
await agent.errors.report({
  error: new Error("Config validation failed"),
  severity: "warning",
  stepName: "config-check",
  executionState: { config: parsedConfig },
  tags: { phase: "initialization" },
});
```

### Feedback Collection

Submit structured feedback from agent workflows — bug reports, workflow issues, agent issues, feature requests, and general feedback.

```typescript
// Report an agent-specific issue
await agent.feedback.reportAgentIssue(
  "Model hallucinated a non-existent API endpoint",
  { endpoint: "/api/v3/nonexistent", model: "gpt-4" },
);

// Report a workflow issue
await agent.feedback.reportWorkflowIssue(
  "Pipeline stalled waiting for approval step",
  { pipelineId: "deploy-123", waitTime: "300s" },
);

// Report a bug
await agent.feedback.reportBug("File watcher missed changes in symlinked dirs");

// Request a feature
await agent.feedback.requestFeature("Support parallel tool execution");

// Full control with submit()
await agent.feedback.submit({
  category: "agent-issue",
  message: "Description of the issue",
  email: "team@example.com",
  taskName: "code-review",
  metadata: { severity: "high" },
});
```

### Execution Breadcrumbs

Track agent execution steps to provide context for error reports. Breadcrumbs are automatically attached to error reports.

```typescript
// Tool calls
agent.breadcrumbs.addToolCall("file-read", { path: "config.json" });
agent.breadcrumbs.addToolResult("file-read", true, "Read 42 lines");

// Execution steps
agent.breadcrumbs.addStep("parse-config", "Parsing configuration file");

// Decisions
agent.breadcrumbs.addDecision(
  "Use streaming API",
  "File is larger than 10MB",
  ["Read entire file", "Use streaming API"],
);

// API calls
agent.breadcrumbs.addApiCall("POST", "https://api.example.com/deploy", 200);

// File operations
agent.breadcrumbs.addFileOperation("write", "dist/output.js");

// User interactions
agent.breadcrumbs.addUserInteraction("User approved deployment");

// Custom
agent.breadcrumbs.addCustom("model-call", "Called LLM for code review", {
  tokens: 1500,
});
```

### Step Wrapping

Wrap async operations with automatic error reporting — if the function throws, the error is captured and reported before re-throwing.

```typescript
const result = await agent.wrapStep("fetch-data", async () => {
  const response = await fetch("https://api.example.com/data");
  return response.json();
});
```

### Context Management

Update the agent context as execution progresses.

```typescript
// Set the current task
agent.updateContext({ taskName: "code-review" });

// Set session ID for tracking
agent.updateContext({ sessionId: "session-abc-123" });

// Set parent agent for sub-agent tracking
agent.updateContext({ parentAgent: "orchestrator-agent" });

// Add custom metadata
agent.updateContext({ metadata: { repository: "my-org/my-repo" } });

// Set user identity
agent.setUserId("agent-instance-42");
```

## Integration with Agent Frameworks

### Basic Agent Loop

```typescript
import { initOasisAgent } from "@oasis/agent";

const agent = initOasisAgent({
  apiKey: "pk_my-app_key123",
  serverUrl: "https://oasis.myapp.com",
  appVersion: "1.0.0",
  agentName: "task-agent",
});

async function runAgent(task: string) {
  agent.updateContext({ taskName: task, sessionId: crypto.randomUUID() });
  agent.breadcrumbs.addStep("start", `Starting task: ${task}`);

  try {
    // Plan
    const plan = await agent.wrapStep("plan", () => generatePlan(task));

    // Execute steps
    for (const step of plan.steps) {
      await agent.wrapStep(step.name, async () => {
        agent.breadcrumbs.addToolCall(step.tool, step.params);
        const result = await executeTool(step.tool, step.params);
        agent.breadcrumbs.addToolResult(step.tool, true, result.summary);
        return result;
      });
    }

    agent.breadcrumbs.addStep("complete", "Task completed successfully");
  } catch (error) {
    // Error already reported by wrapStep, but add final context
    await agent.feedback.reportWorkflowIssue(`Task "${task}" failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### Sub-Agent Integration

```typescript
// Parent agent
const parentAgent = initOasisAgent({
  apiKey: "pk_my-app_key123",
  serverUrl: "https://oasis.myapp.com",
  appVersion: "1.0.0",
  agentName: "orchestrator",
});

// Child agent
const childAgent = initOasisAgent({
  apiKey: "pk_my-app_key123",
  serverUrl: "https://oasis.myapp.com",
  appVersion: "1.0.0",
  agentName: "code-writer",
});
childAgent.updateContext({ parentAgent: "orchestrator" });
```

## API Reference

### `initOasisAgent(config): OasisAgentInstance`

Initialize the agent skill. Returns an instance with the following interface:

| Property/Method | Description |
| --- | --- |
| `feedback` | `AgentFeedbackManager` — submit feedback |
| `errors` | `AgentErrorReporter` — report errors |
| `breadcrumbs` | `AgentBreadcrumbManager` — track execution |
| `getContext()` | Get the current agent context |
| `getConfig()` | Get the current configuration |
| `updateContext(updates)` | Update context (taskName, sessionId, etc.) |
| `setUserId(id)` | Set user/agent identity for attribution |
| `wrapStep(name, fn)` | Wrap async fn with error reporting |
| `destroy()` | Clean up resources |

## Requirements

- Node.js >= 18.0.0 (uses global `fetch`)
- An Oasis server instance with a public API key (`pk_*`)
