# AI Debug Assistant Design

## 1. Goal

Build a local-first visual web tool for engineering troubleshooting.

The tool is not another AI chat UI. Its value is to collect bounded evidence, organize debugging context, and use a configurable model to produce a structured diagnosis.

The first version should support:

- Visual web workflow.
- OpenAI-compatible model configuration.
- Structured problem input.
- Evidence collection from ticket URL, page URL, curl, HAR, logs, schema SQL, and local repository path.
- Evidence-gap detection.
- Structured troubleshooting report.
- Future integration with codegraph, browser MCP, internal tickets, CI, K8s, and database schema parsing.

## 2. Five Design Iterations

### Iteration 1: Generic Web Chat

Initial idea:

- Provide a web page.
- User configures API key and model.
- User chats with the model.

Decision:

- Rejected as the main product direction.

Reason:

- It is too close to directly using Claude, ChatGPT, DeepSeek, or Qwen.
- It does not reduce the real debugging cost: collecting logs, code context, API responses, schema, and system state.
- It cannot reliably constrain the model's reasoning path.

### Iteration 2: Structured Web Form

Improvement:

- Replace free-form chat-first input with a structured troubleshooting case.
- Require the user to provide:
  - Actual behavior.
  - Expected behavior.
  - Entry point.
  - Environment.

Decision:

- Kept.

Reason:

- Most debugging starts from observed behavior and expected behavior.
- Structured input lets the system classify the problem before calling the model.
- It prevents the assistant from guessing too early.

### Iteration 3: Evidence-Driven Workspace

Improvement:

- Add an evidence panel.
- Evidence types:
  - Work item URL or identifier.
  - Page URL.
  - API URL.
  - Copy as cURL.
  - HAR file.
  - Screenshot.
  - Logs.
  - Local repository path.
  - init.sql or schema.sql.

Decision:

- Kept.

Reason:

- Real debugging needs evidence, not just text.
- The tool should ask for the smallest missing evidence item instead of asking the user to dump everything.

### Iteration 4: Visual Debugging Pipeline

Improvement:

- Show the debugging pipeline in the UI.
- Each step has a status:
  - Waiting.
  - Ready.
  - Running.
  - Blocked.
  - Done.

Pipeline:

1. Normalize input.
2. Classify issue.
3. Collect evidence.
4. Inspect interface response.
5. Analyze code context.
6. Analyze database schema.
7. Generate diagnosis.
8. Produce fix plan.

Decision:

- Kept.

Reason:

- Users need to see why the assistant is asking for more information.
- It makes the AI workflow auditable.
- It reduces the feeling that the model is making unsupported guesses.

### Iteration 5: Local-First Web MVP

Final MVP direction:

- Build a local web app.
- Do not start with CLI.
- Do not start with team accounts, cloud storage, or automatic code changes.
- Keep API keys local and transient.
- Provide a visual case workspace with evidence collection and report generation.

Decision:

- Selected for implementation.

Reason:

- It matches the desired user experience.
- It is fast to build.
- It leaves room for codegraph, browser MCP, internal systems, and model routing.

## 3. Final Product Shape

The product is a local web troubleshooting workbench.

User provides the minimum issue description:

```text
Actual behavior:
The approval detail page displays numbers in some fields.

Expected behavior:
The fields should display readable names.

Entry:
PLJI-2458 or a page URL.

Environment:
Wanlian on-site environment, user yunying.
```

The tool then decides what evidence is missing.

Example:

```text
The issue looks like a page field rendering problem.
To distinguish frontend mapping from backend response problems, provide the detail API response.
Recommended input: Copy as cURL from the browser Network panel.
```

After enough evidence is provided, the tool generates:

- Problem summary.
- Confirmed facts.
- Evidence chain.
- Root-cause hypotheses ranked by confidence.
- Highest-confidence diagnosis.
- Verification steps.
- Suggested fix.
- Impact scope.
- Regression checklist.
- Missing information, if any.

## 4. User Workflow

### Step 1: Open Web App

User opens:

```text
http://localhost:8787
```

### Step 2: Configure Model

User enters:

```text
Provider type: OpenAI-compatible
Base URL: https://api.example.com/v1
API key: sk-xxx
Model: model-name
```

The first version should not persist the API key by default.

### Step 3: Create Troubleshooting Case

Required fields:

```text
Actual behavior
Expected behavior
Entry point
Environment
```

Optional fields:

```text
Occurred time
Affected user
Module name
Priority
Related branch or commit
```

### Step 4: Add Evidence

Supported evidence in MVP:

```text
Ticket URL or identifier
Page URL
Copy as cURL
HAR text or file
Log text
Schema SQL
Local repository path
Screenshot notes
```

The MVP may parse text evidence first. File upload and image OCR can be added later.

### Step 5: Run Analysis

The tool performs:

1. Problem classification.
2. Evidence completeness check.
3. Context packaging.
4. Model call.
5. Structured report generation.

### Step 6: Iterate

If blocked, the tool asks for one next input.

Examples:

```text
Need detail API response. Please paste Copy as cURL.
```

```text
Need code context. Please provide local repository path or enable codegraph for this repo.
```

```text
Need dictionary schema. Please paste init.sql or schema.sql.
```

## 5. Input Constraints

The tool should not accept vague debugging input as enough for high-confidence diagnosis.

### Minimum Required Input

Every case must include:

```text
Actual behavior
Expected behavior
Entry point
Environment
```

### Evidence Levels

#### L0: Description Only

Available:

```text
Actual behavior
Expected behavior
Environment
```

Output:

- Problem classification.
- Likely diagnostic path.
- Missing evidence request.

No root cause should be claimed as final.

#### L1: Description + Ticket or Page URL

Available:

```text
Ticket content
Screenshot notes
Page route
Environment
```

Output:

- Issue classification.
- UI module guess.
- Evidence request, usually cURL or HAR.

#### L2: Description + API Evidence

Available:

```text
Copy as cURL
HAR
API response
Request parameters
```

Output:

- Determine whether the issue is likely frontend rendering, backend conversion, or data source.
- Produce medium-confidence diagnosis.

#### L3: API Evidence + Code Context + Schema

Available:

```text
API response
Code path
Recent diff
Schema SQL
Dictionary tables
```

Output:

- High-confidence root cause.
- Code-level fix proposal.
- Regression checklist.

## 6. Core Diagnostic Rules

For page field display issues:

```text
If API returns number and UI displays number:
  Check backend DTO conversion, dictionary mapping, data sync, or source-specific branch logic.

If API returns readable label but UI displays number:
  Check frontend field mapping, table/detail render function, valueEnum, or dictionary cache.

If API returns both code and name but UI uses code:
  Check frontend component field binding.

If only center-origin resources fail:
  Check sourceType/resourceFrom branch logic and center-resource sync mapping.

If schema contains dictionary table but API returns raw code:
  Check whether backend performs dictionary enrichment for this detail API.
```

For duplicate key issues:

```text
Use SQL schema to locate unique indexes.
Use codegraph to locate insert/update path.
Use git diff to inspect recent changes around key generation or idempotency.
```

For missing column issues:

```text
Compare SQL in code with init.sql/schema.sql.
Check migration status and environment schema drift.
```

For timeout issues:

```text
Inspect SQL query conditions.
Compare where/order fields with indexes.
Check pagination and join path.
```

## 7. Architecture

```text
Web UI
  |
  v
Backend API
  |
  +-- Case Manager
  +-- Input Normalizer
  +-- Evidence Store
  +-- Evidence Analyzer
  +-- Code Context Provider
  +-- DB Context Provider
  +-- Browser Context Provider
  +-- Ticket Provider
  +-- LLM Router
  +-- Report Generator
```

### Web UI

Responsibilities:

- Model configuration form.
- Case creation form.
- Evidence panel.
- Pipeline status.
- Report view.
- Follow-up input.

### Backend API

Responsibilities:

- Parse and normalize inputs.
- Call providers.
- Package context for the model.
- Return structured result.

### Case Manager

Stores current troubleshooting case in memory for MVP.

Future:

- Local SQLite persistence.
- Export/import case JSON.

### Evidence Store

Stores evidence items:

```text
type
source
content
createdAt
summary
parsedData
```

### Evidence Analyzer

Determines:

- Issue category.
- Current evidence level.
- Missing evidence.
- Next best user action.

### Code Context Provider

First version:

- Accept local repository path.
- Run simple file search and git diff.

Preferred extension:

- Use codegraph when available.

Provider order:

```text
CodeGraphProvider
RgFallbackProvider
ManualContextProvider
```

### DB Context Provider

First version:

- Accept pasted SQL.
- Extract table names, fields, indexes, and dictionary-looking tables with simple parsing.

Preferred extension:

- Use a real SQL parser.

### Browser Context Provider

First version:

- Accept pasted cURL or HAR.

Future:

- Use mcp-chrome to inspect current page and network requests after user opens the page in a logged-in browser.

### Ticket Provider

First version:

- Treat ticket content as user-provided text unless a local integration is configured.

Future:

- Cloud work item integration, such as Yunxiao.

### LLM Router

MVP:

```text
OpenAI-compatible Chat Completions
```

Future:

```text
Claude
Gemini
Ollama
Company internal model gateway
Model routing by task type
```

## 8. UI Layout

### Main Layout

```text
Header
  - App name
  - Model connection status

Left Panel
  - Model settings
  - Case form

Center Panel
  - Debugging pipeline
  - Evidence cards
  - Missing evidence prompt

Right Panel
  - Analysis report
  - Fix plan
  - Regression checklist
```

### Required UI Controls

- Inputs for model config.
- Textareas for actual behavior, expected behavior, environment.
- Evidence type selector.
- Evidence textarea.
- Add evidence button.
- Run analysis button.
- Pipeline status indicators.
- Report tabs:
  - Diagnosis.
  - Evidence.
  - Fix.
  - Tests.

## 9. MVP Implementation Plan

### Phase 1: Static Web Workflow

Goal:

- Build visual interface.
- Local case state.
- Add evidence.
- Show evidence level and missing evidence.

No model call required yet.

### Phase 2: Model Call

Goal:

- Add OpenAI-compatible API call.
- Generate structured report.

### Phase 3: Evidence Parsing

Goal:

- Parse cURL.
- Parse rough HAR JSON.
- Extract URL, method, headers, request body, response body if present.
- Parse schema SQL enough to identify tables, columns, and indexes.

### Phase 4: Code Context

Goal:

- Accept repo path.
- Run repository search based on route, API path, error keywords, and field names.
- Add codegraph provider when available.

### Phase 5: Browser and Internal Systems

Goal:

- Add mcp-chrome integration for current page and network.
- Add Yunxiao ticket integration.
- Add CI/K8s/log connectors.

## 10. First Version Scope

Build now:

- Local web app.
- Model config.
- Case form.
- Evidence panel.
- Evidence completeness analysis.
- OpenAI-compatible report generation.
- Manual cURL/HAR/log/schema input.
- Clean visual pipeline.

Do not build yet:

- Team login.
- Cloud storage.
- Automatic fixes.
- Automatic dangerous commands.
- Full codegraph integration.
- Full browser automation.
- Full SQL parser.

## 11. Success Criteria

The MVP is successful if a user can:

1. Open the local web app.
2. Configure a model.
3. Create a troubleshooting case.
4. Add cURL, logs, schema, or ticket text.
5. See what evidence is missing.
6. Generate a structured diagnosis report.
7. Understand the next verification step or fix direction.

## 12. Example Case

Input:

```text
Actual behavior:
The approval detail page displays numeric field values.

Expected behavior:
The page should display readable Chinese names.

Entry:
PLJI-2458 or approval detail page URL.

Environment:
Wanlian on-site environment, user yunying.
```

Tool classification:

```text
Issue type:
Page field display abnormality.

Likely chain:
Frontend field rendering -> detail API -> backend DTO -> dictionary conversion -> database/source data.
```

Missing evidence:

```text
Need detail API response.
Recommended input: Copy as cURL from browser Network panel.
```

After cURL is provided:

```text
If response contains raw code only:
  Focus on backend dictionary conversion or center-resource sync mapping.

If response contains label:
  Focus on frontend display binding.

If response contains code and label:
  Check whether frontend uses the code field instead of the label field.
```

Final report:

```text
Problem summary
Confirmed facts
Evidence chain
Root-cause hypothesis ranking
Recommended verification
Suggested fix
Regression checklist
Remaining unknowns
```

## 13. Recommended Directory Structure

```text
ai-debug-assistant/
  DESIGN.md
  README.md
  backend/
    app/
      main.py
      llm.py
      cases.py
      evidence.py
      analyzer.py
      report.py
      providers/
        code_context.py
        db_context.py
        browser_context.py
        ticket_context.py
  frontend/
    src/
      App.tsx
      components/
      api/
      styles/
  docs/
    examples/
```

This structure keeps the design document and future implementation in the same project folder.
