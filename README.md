# Mastra Slack HITL Deep Research

Mastra Slack HITL is an MVP that runs a Mastra workflow from Slack. A human approves the AI-generated research plan before the actual deep research proceeds, and the full progress plus final report is streamed back to the originating Slack channel.

## High-Level Architecture

- **Slack**: `/research` slash command plus streaming updates and approval buttons.
- **Mastra**: workflow pipeline (`plan → HITL approval → gather → deliver`).
- **Storage**: SQLite during development (`./data/mastra.db`), swappable with PostgreSQL later.
- **Background jobs**: cron-style deadline checker for pending approvals.

## Project Structure

```
src/
  mastra/
    agents/
    tools/
    workflows/
      steps/
    index.ts
  slack/
    handlers/
    bolt-app.ts
  db/
  jobs/
  index.ts
```

Additional docs describing the implementation roadmap live in `docs/designe/initial.md` and `docs/implementation-tasks.md`.

## Getting Started

1. Copy the sample env files and fill in your credentials:
   - `cp .env.development.example .env.development`
   - `cp .env.production.example .env.production`
   - Minimum required values: Slack tokens (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`), `OPENAI_API_KEY`, SQLite `DATABASE_URL`, and the Tavily MCP key `TAVILY_API_KEY`.
2. Install dependencies with `pnpm install` (recommended).
3. Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run format:check` to validate the workspace scaffold.
4. Apply the latest DB migrations once via `pnpm db:migrate` (this keeps the SQLite schema in sync with Drizzle).
5. Start Mastra Studio locally with `pnpm run dev`. The CLI launches the Mastra playground + REST server at http://localhost:4111/ so you can poke at the research agents/workflows even before the Slack wiring is finished.
   - Boot only the Slack Bolt watcher with `pnpm run dev:slack` when you want to test `/research` streaming or approval actions.
   - If your environment is missing the `mastra` CLI, install it once via `pnpm add -D mastra` (or run `pnpm dlx mastra dev`).

The actual Mastra workflow logic, Slack handlers, and database integrations will be implemented task by task following `docs/implementation-tasks.md`.
