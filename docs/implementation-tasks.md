# 実装タスクリスト - Mastra Slack HITL Deep Research

## ライブラリバージョン情報

### 確認済み最新バージョン（2025-11-13）

| パッケージ | バージョン | 発行日 | 備考 |
|-----------|-----------|--------|------|
| @mastra/core | 0.24.0 | 2025-11-11 | suspend/resume fixes, workflow input preservation |
| @slack/bolt | 4.5.0 | 2025-10 | AI features, Socket Mode/Events API両対応 |
| @mastra/libsql | 0.16.1 | 2025-04 | SQLite storage for development |
| node-cron | 4.2.1 | 2025-07 | 定期ジョブ実行 |
| zod | 3.23.x | latest | Schema validation |
| @types/node | 18.x | latest | Node.js 18+ types |

### 重要な互換性情報

- **@mastra/core 0.24.0**: `suspend()`/`resume()` の修正が含まれており、HITL実装に必須
- **@slack/bolt 4.5.0**: Socket ModeとEvents APIの両方をサポート、環境変数での切り替えが可能
- **Node.js**: 18+ 必須（ESM modules対応）
- **TypeScript**: strict mode推奨

---

## Phase 0: プロジェクト基盤セットアップ

### Task 0-1: プロジェクト構造作成
**Priority**: P0 (Blocker)
**Dependencies**: なし
**Estimated Complexity**: Low

**Description**:
```
/src
  /mastra
    /agents
      research-agent.ts
      report-agent.ts
    /tools
      evaluate-result-tool.ts
    /workflows
      research-workflow.ts
      deliver-workflow.ts
      main-workflow.ts
    index.ts
  /mcp
    tavily-client.ts
  /slack
    bolt-app.ts
    /handlers
      command-handler.ts
      action-handler.ts
      streaming-handler.ts
  /db
    schema.ts
    client.ts
  /jobs
    deadline-checker.ts
  index.ts
/data
  mastra.db (gitignore)
/docs
  /designe
package.json
tsconfig.json
.env.development.example
.env.production.example
.gitignore
README.md
```

**Acceptance Criteria**:
- [x] すべてのディレクトリが作成されている
- [x] `.gitignore` に `/data/mastra.db`, `.env*` が含まれている
- [x] README.mdにプロジェクト概要が記載されている

---

### Task 0-2: package.json と依存関係セットアップ
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-1
**Estimated Complexity**: Low

**Description**:
```json
{
  "name": "mastra-slack-hitl",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\""
  },
  "dependencies": {
    "@mastra/core": "^0.24.0",
    "@mastra/libsql": "^0.16.1",
    "@slack/bolt": "^4.5.0",
    "node-cron": "^4.2.1",
    "zod": "^3.23.0",
    "dotenv": "^16.4.5",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.19.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0"
  }
}
```

**Acceptance Criteria**:
- [x] `pnpm install` が成功する
- [x] すべての依存関係が最新の互換バージョンでインストールされている
- [x] `@mastra/core@0.24.0` 以上がインストールされている（suspend/resume fixes必須）

---

### Task 0-3: TypeScript設定
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-2
**Estimated Complexity**: Low

**Description**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Acceptance Criteria**:
- [x] `pnpm run typecheck` が成功する
- [x] strict mode有効
- [x] ESM modules設定完了

---

### Task 0-4: ESLint & Prettier設定
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-3
**Estimated Complexity**: Low

**Description**:
- ESLint設定（TypeScript推奨ルール）
- Prettier設定（コードフォーマット）
- Git pre-commit hook（オプション）

**Acceptance Criteria**:
- [x] `pnpm run lint` が成功する
- [x] `pnpm run format:check` が成功する
- [x] `pnpm run lint:fix` でauto-fix可能

---

### Task 0-5: 環境変数設定
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-1
**Estimated Complexity**: Low

**Description**:
```bash
# .env.development.example
# Slack設定（開発: Socket Mode）
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-xxx
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx

# Database（開発: SQLite/LibSQL）
DATABASE_URL=file:./data/mastra.db

# LLM API
OPENAI_API_KEY=sk-xxx

# Tavily MCP
TAVILY_API_KEY=tvly-xxx

# Logging
LOG_LEVEL=debug

# .env.production.example
# Slack設定（本番: Events API）
SLACK_SOCKET_MODE=false
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx
PORT=3000

# Database（本番: SQLite/LibSQL）
DATABASE_URL=file:/var/lib/mastra/mastra.db

# LLM API
OPENAI_API_KEY=sk-xxx

# Tavily MCP
TAVILY_API_KEY=tvly-xxx

# Logging
LOG_LEVEL=info
```

**Acceptance Criteria**:
- [x] `.env.development.example` 作成済み
- [x] `.env.production.example` 作成済み
- [x] README.mdに環境変数設定手順が記載されている
- [x] `.gitignore` に `.env*` が含まれている（`.example` を除く）

---

## Phase 1: データベース層（Drizzle ORM）

### Task 1-1: データベーススキーマ定義
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-5
**Estimated Complexity**: Low

**Description**:
Drizzle ORM の schema builder を利用し、Slack メタデータ用テーブルとインデックスを型安全に定義する。

```typescript
// src/db/schema.ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const slackMetadata = sqliteTable(
  'slack_metadata',
  {
    runId: text('run_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    messageTs: text('message_ts'),
    threadTs: text('thread_ts'),
    requester: text('requester').notNull(),
    deadlineAt: integer('deadline_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    deadlineIdx: index('idx_slack_metadata_deadline').on(table.deadlineAt),
    channelIdx: index('idx_slack_metadata_channel').on(table.channelId),
  }),
);

export type SlackMetadataSelect = typeof slackMetadata.$inferSelect;
export type SlackMetadataInsert = typeof slackMetadata.$inferInsert;
```

**Acceptance Criteria**:
- [x] Drizzle ORM で schema と index が宣言されている
- [x] `$inferSelect` / `$inferInsert` 型がエクスポートされ、Repository から利用できる
- [x] 旧来の raw SQL 文字列は廃止している

---

### Task 1-2: データベースクライアント実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 1-1
**Estimated Complexity**: Medium

**Description**:
Drizzle ORM + LibSQL ドライバでクライアントを構築し、`drizzle-kit` のマイグレーションを適用する。Repository 層はすべて Drizzle の query builder を用いる。

```typescript
// src/db/client.ts
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq, lt } from 'drizzle-orm';
import { slackMetadata, SlackMetadataInsert } from './schema';

export type SQLiteDb = ReturnType<typeof drizzle>;

export const initDatabase = async (): Promise<SQLiteDb> => {
  const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/mastra.db',
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });

  const db = drizzle(client, { schema: { slackMetadata } });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db;
};

export class SlackMetadataRepository {
  constructor(private readonly db: SQLiteDb) {}

  async create(data: SlackMetadataInsert) {
    const now = Date.now();
    await this.db.insert(slackMetadata).values({ ...data, createdAt: now, updatedAt: now });
  }

  async updateMessageTs(runId: string, messageTs: string) {
    await this.db
      .update(slackMetadata)
      .set({ messageTs, updatedAt: Date.now() })
      .where(eq(slackMetadata.runId, runId));
  }

  async getByRunId(runId: string) {
    return this.db.query.slackMetadata.findFirst({
      where: (table, { eq }) => eq(table.runId, runId),
    });
  }

  async getExpiredApprovals(now = Date.now()) {
    return this.db
      .select()
      .from(slackMetadata)
      .where(lt(slackMetadata.deadlineAt, now))
      .orderBy(slackMetadata.deadlineAt);
  }
}
```

セットアップ要件:
- `drizzle-orm`, `drizzle-kit`, `@libsql/client` を `package.json` に追加
- `drizzle.config.ts` を作成し、`schema`/`out` パスを定義
- npm scripts 例: `"db:generate": "drizzle-kit generate:sqlite --config drizzle.config.ts"`, `"db:migrate": "drizzle-kit push --config drizzle.config.ts"`

**Acceptance Criteria**:
- [x] Drizzle + LibSQL クライアントが `initDatabase` で返却される
- [x] マイグレーションが `migrate()` で自動適用される
- [x] Repository が Drizzle のクエリで CRUD を実装し、raw SQL を使っていない
- [x] 型推論（`SlackMetadataInsert` など）が活用されている

---

## Phase 2: Mastra Workflow実装

### Task 2-1: Mastraインスタンス初期化
**Priority**: P0 (Blocker)
**Dependencies**: Task 1-2
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { initDatabase } from '../db/client';
import { researchAgent, reportAgent } from './agents';
import { mainWorkflow } from './workflows/main-workflow';

export const initMastra = async () => {
  const storage = await initDatabase();

  const mastra = new Mastra({
    name: 'slack-research-hitl',
    storage,
    agents: [researchAgent, reportAgent],
    workflows: [mainWorkflow],
    observability: {
      aiTracing: {
        enabled: true,
      },
    },
  });

  return mastra;
};

let mastraInstance: Mastra | null = null;

export const getMastra = async () => {
  if (!mastraInstance) {
    mastraInstance = await initMastra();
  }
  return mastraInstance;
};
```

**Acceptance Criteria**:
- [x] Mastraインスタンスが正しく初期化される
- [x] ストレージが設定されている
- [x] AI Tracingが有効化されている
- [x] シングルトンパターンで実装されている

---

### Task 2-2: Research Agent実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 2-1
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/mastra/agents/research-agent.ts
import { Agent } from '@mastra/core/agent';

import { evaluateResultTool } from '../tools/evaluate-result-tool';
import { tavilyMcpClient } from '../../mcp/tavily-client';

const tavilyTools = await tavilyMcpClient.getTools();

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  description: 'Deep research agent for planning and executing research tasks',
  model: 'openai/gpt-4o',
  defaultStreamOptions: {
    toolChoice: 'none',
    temperature: 0.2,
  },
  defaultGenerateOptions: {
    toolChoice: 'auto',
    temperature: 0.4,
  },
  instructions: `You are a research agent that helps users conduct deep research.

Your responsibilities:
1. Create detailed research plans with clear objectives, scope, hypotheses, and methodology
2. Execute Tavily MCP search results to gather information
3. Evaluate and synthesize findings
4. Maintain high quality standards throughout the research process

When creating a research plan, include:
- Clear objectives
- Scope and boundaries
- Key hypotheses to test
- Research methodology
- Expected deliverables`,
  tools: {
    ...tavilyTools, // e.g. tavily.search
    'evaluate-result': evaluateResultTool,
  },
});
```

**Acceptance Criteria**:
- [x] エージェントが正しく定義されている
- [x] GPT-4oモデルを使用している
- [x] Tavily MCPツール + evaluate-resultツールを組み合わせて登録している
- [x] インストラクションが明確である

---

### Task 2-3: Report Agent実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 2-2
**Estimated Complexity**: Low

**Description**:
```typescript
// src/mastra/agents/report-agent.ts
import { createAgent } from '@mastra/core/agents';

export const reportAgent = createAgent({
  id: 'report-agent',
  name: 'Report Agent',
  description: 'Agent specialized in generating comprehensive research reports',
  model: {
    provider: 'OPEN_AI',
    name: 'gpt-4o',
  },
  instructions: `You are a report generation agent that creates comprehensive research reports.

Your responsibilities:
1. Synthesize research findings into clear, actionable reports
2. Structure reports with executive summaries, detailed analysis, and recommendations
3. Use clear, professional language
4. Cite sources appropriately

Report structure:
## Executive Summary
- Key findings (3-5 bullets)
- Main recommendations

## Detailed Analysis
- Organized by theme/topic
- Data-driven insights

## Recommendations
- Actionable next steps
- Priority ranking

## References
- All sources cited`,
});
```

**Acceptance Criteria**:
- [x] エージェントが正しく定義されている
- [x] インストラクションがレポート生成に最適化されている

---

### Task 2-4: Tavily MCP統合
**Priority**: P0 (Blocker)
**Dependencies**: Task 2-2
**Estimated Complexity**: Medium

**Description**:
1. Tavily MCP クライアントを作成し、Mastra プロセス内でサーバーを起動できるようにする。
```typescript
// src/mcp/tavily-client.ts
import { MCPClient } from '@mastra/mcp';

export const tavilyMcpClient = new MCPClient({
  id: 'tavily-mcp',
  servers: {
    tavily: {
      command: 'npx',
      args: ['-y', 'tavily-mcp'],
      env: {
        ...process.env,
        TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
      },
      timeout: 60_000,
    },
  },
});
```
   - 依存追加: `@mastra/mcp`, `tavily-mcp`
   - `TAVILY_API_KEY` が未設定の場合は即座にエラーを投げ、起動時に気付けるようにする

2. Research Agent で MCP ツールを直接ロードする。
```typescript
// src/mastra/agents/research-agent.ts
import { Agent } from '@mastra/core/agent';

import { evaluateResultTool } from '../tools/evaluate-result-tool';
import { tavilyMcpClient } from '../../mcp/tavily-client';

const tavilyTools = await tavilyMcpClient.getTools();

export const researchAgent = new Agent({
  id: 'research-agent',
  // ...
  tools: {
    ...tavilyTools, // exposes tavily.search
    'evaluate-result': evaluateResultTool,
  },
});
```
   - Static構成の場合は起動時に `getTools()` をawaitして登録。ユーザー毎に切り替える必要があれば `getToolsets()` を使い、`researchAgent.generate(..., { toolsets })` で渡す運用に拡張する。

**Acceptance Criteria**:
- [x] Tavily MCP を `MCPClient` で管理し、`TAVILY_API_KEY` を使って起動している
- [x] `research-agent` に `tavily.search` が直接登録されており、追加の `createTool` は不要
- [x] 依存パッケージが `package.json` に追記され、README/環境変数サンプルで `TAVILY_API_KEY` を案内している

---

### Task 2-5: planStep実装
**Priority**: P1 (High)
**Dependencies**: Task 2-4
**Estimated Complexity**: High

**Description**:
```typescript
// src/mastra/workflows/steps/plan-step.ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

export const planStep = createStep({
  id: 'plan-step',
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    plan: z.string(),
  }),
  execute: async ({ inputData, mastra, writer }) => {
    const researchAgent = mastra.getAgent('research-agent');

    // 方針を生成（ストリーミング）
    const stream = await researchAgent.stream(
      `Create a detailed research plan for: "${inputData.query}"

Include:
1. Research objectives
2. Scope and boundaries
3. Key hypotheses
4. Research methodology
5. Expected deliverables structure`
    );

    let plan = '';
    for await (const chunk of stream.textStream) {
      plan += chunk;

      // Slackに進捗を配信（custom event）
      await writer?.write({
        type: 'plan-chunk',
        chunk: chunk,
      });
    }

    return { plan };
  },
});
```

**Acceptance Criteria**:
- [x] エージェントのストリーミング機能が動作する
- [x] custom eventが正しく送信される
- [x] 完全な調査方針が生成される
- [x] エラーハンドリングが実装されている

---

### Task 2-6: approvalStep実装（HITL承認ゲート）
**Priority**: P0 (Blocker)
**Dependencies**: Task 2-5
**Estimated Complexity**: High

**Description**:
```typescript
// src/mastra/workflows/steps/approval-step.ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

export const approvalStep = createStep({
  id: 'approval-step',
  inputSchema: z.object({
    plan: z.string(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    approver: z.string().optional(),
    reason: z.string().optional(),
  }),
  suspendSchema: z.object({
    plan: z.string(),
    requestedAt: z.number(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    approver: z.string(),
    reason: z.string().optional(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      // 承認待ちで一時停止
      return await suspend({
        plan: inputData.plan,
        requestedAt: Date.now(),
      });
    }

    // 承認/差戻しの結果を返す
    return {
      approved: resumeData.approved,
      approver: resumeData.approver,
      reason: resumeData.reason,
    };
  },
});
```

**Acceptance Criteria**:
- [x] suspend()が正しく動作する
- [x] resume()で承認/差戻しができる
- [x] suspendPayloadが正しく保存される
- [x] @mastra/core@0.24.0の修正を活用している

---

### Task 2-7: gatherStep実装（情報収集）
**Priority**: P1 (High)
**Dependencies**: Task 2-6
**Estimated Complexity**: High

**Description**:
```typescript
// src/mastra/workflows/steps/gather-step.ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

export const gatherStep = createStep({
  id: 'gather-step',
  inputSchema: z.object({
    plan: z.string(),
    approved: z.boolean(),
  }),
  outputSchema: z.object({
    researchData: z.any(),
  }),
  execute: async ({ inputData, mastra, writer }) => {
    if (!inputData.approved) {
      throw new Error('Research was rejected - cannot proceed with gathering');
    }

    const researchAgent = mastra.getAgent('research-agent');

    // Web検索 + 分析
    const result = await researchAgent.generate(
      `Execute deep research based on this plan:

${inputData.plan}

Conduct thorough Tavily MCP searches, evaluate sources, and gather comprehensive information.`,
      {
        maxSteps: 10,
        tools: ['tavily.search', 'evaluate-result'],
        onStepFinish: async (step) => {
          // 進捗をSlackに配信
          await writer?.write({
            type: 'gather-progress',
            message: `Step ${step.stepNumber}: ${step.toolName || 'thinking'}`,
            details: step.text,
          });
        },
      }
    );

    await writer?.write({
      type: 'gather-complete',
      message: 'Research data gathering completed',
    });

    return { researchData: result };
  },
});
```

**Acceptance Criteria**:
- [x] 承認後のみ実行される
- [x] 差戻し時はエラーを投げる
- [x] Tavily MCP検索が実行される
- [x] 進捗がストリーミングされる
- [x] maxStepsで無限ループを防止している

---

### Task 2-8: generateReportStep実装
**Priority**: P1 (High)
**Dependencies**: Task 2-7
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/mastra/workflows/steps/generate-report-step.ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

export const generateReportStep = createStep({
  id: 'generate-report-step',
  inputSchema: z.object({
    researchData: z.any(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const reportAgent = mastra.getAgent('report-agent');

    const result = await reportAgent.generate(
      `Generate a comprehensive research report based on this data:

${JSON.stringify(inputData.researchData, null, 2)}

Follow the standard report structure with:
- Executive Summary
- Detailed Analysis
- Recommendations
- References`
    );

    return { report: result.text };
  },
});
```

**Acceptance Criteria**:
- [x] レポートエージェントが動作する
- [x] 構造化されたレポートが生成される
- [x] 研究データが正しく引用される

---

### Task 2-9: researchWorkflow実装
**Priority**: P1 (High)
**Dependencies**: Task 2-8
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/mastra/workflows/research-workflow.ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { planStep } from './steps/plan-step';
import { approvalStep } from './steps/approval-step';
import { gatherStep } from './steps/gather-step';

export const researchWorkflow = createWorkflow({
  id: 'research-workflow',
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    researchData: z.any().optional(),
  }),
})
  .then(planStep)
  .then(approvalStep)
  .then(gatherStep)
  .commit();
```

**Acceptance Criteria**:
- [x] ステップが正しい順序で実行される
- [x] planStep → approvalStep → gatherStepの順
- [x] 差戻し時はgatherStepに進まない

---

### Task 2-10: deliverWorkflow実装
**Priority**: P1 (High)
**Dependencies**: Task 2-8
**Estimated Complexity**: Low

**Description**:
```typescript
// src/mastra/workflows/deliver-workflow.ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { generateReportStep } from './steps/generate-report-step';

export const deliverWorkflow = createWorkflow({
  id: 'deliver-workflow',
  inputSchema: z.object({
    researchData: z.any(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
})
  .then(generateReportStep)
  .commit();
```

**Acceptance Criteria**:
- [x] レポート生成が正しく動作する
- [x] ワークフローが正常に完了する

---

### Task 2-11: mainWorkflow実装（メインオーケストレーション）
**Priority**: P0 (Blocker)
**Dependencies**: Task 2-9, Task 2-10
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/mastra/workflows/main-workflow.ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { researchWorkflow } from './research-workflow';
import { deliverWorkflow } from './deliver-workflow';

export const mainWorkflow = createWorkflow({
  id: 'slack-research-hitl',
  inputSchema: z.object({
    query: z.string(),
    channelId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
    approved: z.boolean(),
  }),
})
  .then(researchWorkflow)  // 調査 + 承認
  .then(deliverWorkflow)   // レポート生成
  .commit();
```

**Acceptance Criteria**:
- [x] ネストされたワークフローが正しく動作する
- [x] researchWorkflow → deliverWorkflowの順で実行される
- [x] 差戻し時はdeliverWorkflowに進まない

---

## Phase 3: Slack統合

### Task 3-1: Bolt App初期化
**Priority**: P0 (Blocker)
**Dependencies**: Task 0-5
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/slack/bolt-app.ts
import { App } from '@slack/bolt';

export const initSlackApp = () => {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,

    // Socket Mode設定（開発時のみ）
    socketMode: process.env.SLACK_SOCKET_MODE === 'true',
    appToken: process.env.SLACK_APP_TOKEN, // Socket Mode時のみ必要
  });

  return app;
};

export const startSlackApp = async (app: App) => {
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.start(port);

  if (process.env.SLACK_SOCKET_MODE === 'true') {
    console.log('⚡️ Slack Bolt app is running in Socket Mode!');
  } else {
    console.log(`⚡️ Slack Bolt app is running on port ${port} (Events API)!`);
  }
};
```

**Acceptance Criteria**:
- [x] Socket Mode/Events API両方で起動できる
- [x] 環境変数で切り替え可能
- [x] 起動時にモードがログ出力される

---

### Task 3-2: `/research` コマンドハンドラ実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 3-1, Task 2-11
**Estimated Complexity**: High

**Description**:
```typescript
// src/slack/handlers/command-handler.ts
import { SlackCommandMiddlewareArgs } from '@slack/bolt';
import { getMastra } from '../../mastra';
import { SlackMetadataRepository } from '../../db/client';

export const handleResearchCommand = async ({
  command,
  ack,
  client,
}: SlackCommandMiddlewareArgs) => {
  await ack();

  const query = command.text;
  const channelId = command.channel_id;
  const userId = command.user_id;

  if (!query || query.trim().length === 0) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: '⚠️ 使用方法: `/research <調査テーマ>`',
    });
    return;
  }

  // Workflowを開始
  const mastra = await getMastra();
  const workflow = mastra.getWorkflow('slack-research-hitl');
  const run = await workflow.createRunAsync();

  // Slack補助テーブルに記録
  const storage = mastra.getStorage();
  const repo = new SlackMetadataRepository(storage);

  await repo.create({
    run_id: run.runId,
    channel_id: channelId,
    requester: userId,
    deadline_at: Date.now() + 24 * 60 * 60 * 1000, // 24時間後
  });

  // Slack Chat Streaming API で初期ストリーム開始
  const streamResponse = await client.chat.startStream({
    channel: channelId,
    text: `🔍 調査を開始します: "${query}"\n\n`,
  });

  const messageTs = streamResponse.ts;

  // message_tsを保存
  await repo.updateMessageTs(run.runId, messageTs);

  // Workflowをストリーミング実行（別ファイルで処理）
  streamWorkflow(run, { query, channelId, userId }, messageTs, client, repo).catch(
    console.error
  );
};
```

**Acceptance Criteria**:
- [x] `/research` コマンドが受信される
- [x] Workflowが開始される
- [x] slack_metadataに記録される
- [x] Slack Chat Streaming APIが開始される
- [x] 空のクエリは拒否される

---

### Task 3-3: Workflow Streaming Handler実装
**Priority**: P1 (High)
**Dependencies**: Task 3-2
**Estimated Complexity**: Very High

**Description**:
```typescript
// src/slack/handlers/streaming-handler.ts
import { WebClient } from '@slack/web-api';

export const streamWorkflow = async (
  run: any,
  input: { query: string; channelId: string; userId: string },
  messageTs: string,
  client: WebClient,
  repo: SlackMetadataRepository
) => {
  try {
    // Workflowをストリーミング実行
    const stream = await run.streamVNext({
      inputData: input,
    });

    for await (const event of stream) {
      // 方針生成の進捗
      if (event.type === 'plan-chunk') {
        await client.chat.appendStream({
          channel: input.channelId,
          ts: messageTs,
          text: event.chunk,
        });
      }

      // 情報収集の進捗
      if (event.type === 'gather-progress') {
        await client.chat.appendStream({
          channel: input.channelId,
          ts: messageTs,
          text: `\n\n✓ ${event.message}`,
        });
      }

      // approvalStepが一時停止
      if (event.type === 'step-end' && event.payload.stepName === 'approval-step') {
        if (event.payload.status === 'suspended') {
          // ストリーミングを終了
          await client.chat.stopStream({
            channel: input.channelId,
            ts: messageTs,
          });

          // 承認ボタンを追加
          await client.chat.update({
            channel: input.channelId,
            ts: messageTs,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '📋 調査方針が生成されました。承認してください。'
                },
              },
              {
                type: 'actions',
                block_id: `approval_${run.runId}`,
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '✅ 承認して本調査を開始' },
                    style: 'primary',
                    action_id: 'approve',
                    value: run.runId,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '❌ 差し戻し' },
                    style: 'danger',
                    action_id: 'reject',
                    value: run.runId,
                  },
                ],
              },
            ],
          });
        }
      }

      // Workflow完了
      if (event.type === 'workflow-finish') {
        await client.chat.stopStream({
          channel: input.channelId,
          ts: messageTs,
        });

        // 最終レポート投稿
        if (event.payload.status === 'success') {
          await client.chat.postMessage({
            channel: input.channelId,
            thread_ts: messageTs,
            text: `📊 調査レポート完成\n\n${event.payload.output.report}`,
          });
        }
      }
    }
  } catch (error) {
    console.error('Workflow streaming error:', error);

    await client.chat.stopStream({
      channel: input.channelId,
      ts: messageTs,
    });

    await client.chat.postMessage({
      channel: input.channelId,
      thread_ts: messageTs,
      text: `❌ エラーが発生しました: ${error.message}`,
    });
  }
};
```

**Acceptance Criteria**:
- [x] streamVNext()が正しく動作する
- [x] plan-chunkイベントがストリーミングされる
- [x] approvalStep一時停止時にボタンが表示される
- [x] workflow完了時にレポートが投稿される
- [x] エラーハンドリングが実装されている

---

### Task 3-4: 承認/差戻しボタンハンドラ実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 3-3
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/slack/handlers/action-handler.ts
import { BlockAction, SlackActionMiddlewareArgs } from '@slack/bolt';
import { getMastra } from '../../mastra';

export const handleApproveAction = async ({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  const action = body.actions[0];
  if (action.type !== 'button') return;

  const runId = action.value;
  const userId = body.user.id;

  // Workflowを再開
  const mastra = await getMastra();
  const workflow = mastra.getWorkflow('slack-research-hitl');
  const run = await workflow.getRunAsync(runId);

  await run.resume({
    step: 'approval-step',
    resumeData: {
      approved: true,
      approver: userId,
    },
  });

  // メッセージ更新
  await client.chat.update({
    channel: body.channel!.id,
    ts: body.message!.ts,
    text: '✅ 承認されました。本調査を開始します...',
    blocks: [], // ボタンを削除
  });

  // ここから再度ストリーミング開始（gather-step）
  const metadata = await repo.getByRunId(runId);
  if (metadata) {
    streamWorkflow(run, metadata, metadata.message_ts!, client, repo).catch(
      console.error
    );
  }
};

export const handleRejectAction = async ({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  const action = body.actions[0];
  if (action.type !== 'button') return;

  const runId = action.value;
  const userId = body.user.id;

  // Workflowを終了
  const mastra = await getMastra();
  const workflow = mastra.getWorkflow('slack-research-hitl');
  const run = await workflow.getRunAsync(runId);

  await run.resume({
    step: 'approval-step',
    resumeData: {
      approved: false,
      approver: userId,
      reason: 'rejected by user',
    },
  });

  // メッセージ更新
  await client.chat.update({
    channel: body.channel!.id,
    ts: body.message!.ts,
    text: '❌ 差し戻されました。調査は中止されました。',
    blocks: [],
  });
};
```

**Acceptance Criteria**:
- [x] 承認ボタンでworkflowが再開される
- [x] 差戻しボタンでworkflowが終了する
- [x] ボタンクリック後にメッセージが更新される
- [x] 重複クリックが無視される（Mastraのidempotency）

---

## Phase 4: 期限管理（背景ジョブ）

### Task 4-1: 期限チェックジョブ実装
**Priority**: P2 (Medium)
**Dependencies**: Task 3-4
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/jobs/deadline-checker.ts
import cron from 'node-cron';
import { getMastra } from '../mastra';
import { SlackMetadataRepository } from '../db/client';
import { WebClient } from '@slack/web-api';

export const startDeadlineChecker = (slackClient: WebClient) => {
  // 15分毎に実行
  cron.schedule('*/15 * * * *', async () => {
    console.log('Running deadline checker...');

    const mastra = await getMastra();
    const storage = mastra.getStorage();
    const repo = new SlackMetadataRepository(storage);
    const now = Date.now();

    // 期限切れの承認待ちを検索
    const expiredApprovals = await repo.getExpiredApprovals(now);

    for (const approval of expiredApprovals) {
      try {
        // Slackに期限切れ通知
        await slackClient.chat.postMessage({
          channel: approval.channel_id,
          thread_ts: approval.message_ts || undefined,
          text: '⏰ 承認期限が切れました。調査は自動的にキャンセルされました。',
        });

        // Workflowを終了（差戻し扱い）
        const workflow = mastra.getWorkflow('slack-research-hitl');
        const run = await workflow.getRunAsync(approval.run_id);

        // suspendedステータスの場合のみresume
        const status = await run.getStatus();
        if (status === 'suspended') {
          await run.resume({
            step: 'approval-step',
            resumeData: {
              approved: false,
              reason: 'timeout',
              approver: 'system',
            },
          });
        }

        // メッセージ更新
        if (approval.message_ts) {
          await slackClient.chat.update({
            channel: approval.channel_id,
            ts: approval.message_ts,
            text: '⏰ 承認期限切れ - 調査は自動的にキャンセルされました',
            blocks: [],
          });
        }
      } catch (error) {
        console.error(`Failed to handle expired approval ${approval.run_id}:`, error);
      }
    }

    console.log(`Processed ${expiredApprovals.length} expired approvals`);
  });

  console.log('✅ Deadline checker started (runs every 15 minutes)');
};
```

**Acceptance Criteria**:
- [x] 15分毎に実行される
- [x] 期限切れの承認待ちを検出する
- [x] Slackに通知が送信される
- [x] Workflowが自動終了される
- [x] エラーハンドリングが実装されている
- [x] suspendedステータスの確認が行われる

---

## Phase 5: エラーハンドリング & Observability

### Task 5-1: ロギング設定
**Priority**: P2 (Medium)
**Dependencies**: Task 0-5
**Estimated Complexity**: Low

**Description**:
```typescript
// src/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
```

**Acceptance Criteria**:
- [x] 構造化ログが出力される
- [x] 開発時はpretty-printされる
- [x] 本番時はJSON形式で出力される
- [x] ログレベルが環境変数で設定可能

---

### Task 5-2: グローバルエラーハンドラ
**Priority**: P2 (Medium)
**Dependencies**: Task 5-1
**Estimated Complexity**: Low

**Description**:
```typescript
// src/index.ts に追加
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception');
  process.exit(1);
});
```

**Acceptance Criteria**:
- [x] unhandledRejectionがログ出力される
- [x] uncaughtExceptionで適切に終了する
- [x] エラー情報が詳細にログ出力される

---

### Task 5-3: Mastra Observability設定
**Priority**: P3 (Low)
**Dependencies**: Task 2-1
**Estimated Complexity**: Low

**Description**:
Mastraの初期化時にAI Tracingを有効化（Task 2-1で実装済み）

追加のOTEL設定（オプション）:
```typescript
// src/mastra/index.ts に追加
observability: {
  aiTracing: {
    enabled: true,
  },
  otel: {
    enabled: process.env.OTEL_ENABLED === 'true',
    exporters: ['console'],
  },
}
```

**Acceptance Criteria**:
- [ ] AI Tracingが有効化されている
- [ ] ワークフロー実行がトレースされる
- [ ] OTEL設定が環境変数で制御可能（オプション）

---

### Task 5-4: KPI収集（オプション）
**Priority**: P3 (Low)
**Dependencies**: Task 4-1
**Estimated Complexity**: Medium

**Description**:
```typescript
// src/analytics/kpi.ts
export interface KPIMetrics {
  totalResearches: number;
  approvalRate: number;
  rejectionRate: number;
  timeoutRate: number;
  avgApprovalTime: number;
  avgWorkflowDuration: number;
}

export class KPICollector {
  async collectMetrics(): Promise<KPIMetrics> {
    // workflow_snapshotsとslack_metadataからメトリクス収集
    // 実装詳細はオプション
  }
}
```

**Acceptance Criteria**:
- [ ] 基本的なKPIが定義されている
- [ ] メトリクス収集の骨組みが実装されている

---

## Phase 6: メインエントリーポイント & 起動

### Task 6-1: メインエントリーポイント実装
**Priority**: P0 (Blocker)
**Dependencies**: Task 3-4, Task 4-1
**Estimated Complexity**: Low

**Description**:
```typescript
// src/index.ts
import 'dotenv/config';
import { initSlackApp, startSlackApp } from './slack/bolt-app';
import { handleResearchCommand } from './slack/handlers/command-handler';
import { handleApproveAction, handleRejectAction } from './slack/handlers/action-handler';
import { startDeadlineChecker } from './jobs/deadline-checker';
import { logger } from './logger';

async function main() {
  try {
    logger.info('Starting Mastra Slack HITL application...');

    // Slack App初期化
    const app = initSlackApp();

    // ハンドラ登録
    app.command('/research', handleResearchCommand);
    app.action('approve', handleApproveAction);
    app.action('reject', handleRejectAction);

    // Slack App起動
    await startSlackApp(app);

    // 期限チェックジョブ開始
    startDeadlineChecker(app.client);

    logger.info('✅ Application started successfully');
  } catch (error) {
    logger.fatal({ error }, 'Failed to start application');
    process.exit(1);
  }
}

main();
```

**Acceptance Criteria**:
- [x] アプリケーションが正常に起動する
- [x] すべてのハンドラが登録される
- [x] 期限チェックジョブが開始される
- [x] エラー時に適切に終了する

---

## Phase 7: テスト & ドキュメント

### Task 7-1: E2Eテストシナリオ実行
**Priority**: P1 (High)
**Dependencies**: Task 6-1
**Estimated Complexity**: High

**Manual Test Scenarios**:

1. **正常フロー（承認）**:
   - [ ] `/research AI技術トレンド2025` を実行
   - [ ] 方針が段階的にストリーミング表示される
   - [ ] 承認ボタンが表示される
   - [ ] 「承認」をクリック
   - [ ] 情報収集の進捗が表示される
   - [ ] 最終レポートが投稿される

2. **差戻しフロー**:
   - [ ] `/research テストクエリ` を実行
   - [ ] 方針が生成される
   - [ ] 「差し戻し」をクリック
   - [ ] ワークフローが終了する
   - [ ] 情報収集に進まない

3. **期限切れフロー**:
   - [ ] `/research テストクエリ` を実行
   - [ ] 24時間待機（または期限を1分に変更してテスト）
   - [ ] 期限チェックジョブが実行される
   - [ ] 自動的に終了通知が送信される

4. **エラーハンドリング**:
   - [ ] 空のクエリで実行: `/research`
   - [ ] エラーメッセージが表示される

5. **再起動耐性**:
   - [ ] `/research テストクエリ` を実行
   - [ ] 方針生成中にアプリを再起動
   - [ ] 承認待ち状態が維持される
   - [ ] 承認ボタンが機能する

**Acceptance Criteria**:
- [ ] すべてのシナリオが正常に動作する
- [ ] suspend/resumeが正しく機能する
- [ ] ストリーミングが正しく動作する
- [ ] 期限切れ処理が動作する

---

### Task 7-2: README作成
**Priority**: P2 (Medium)
**Dependencies**: Task 7-1
**Estimated Complexity**: Low

**Description**:
- プロジェクト概要
- セットアップ手順
- 環境変数設定
- 開発/本番モード切り替え
- Slack App設定手順
- トラブルシューティング

**Acceptance Criteria**:
- [ ] README.mdが作成されている
- [ ] セットアップ手順が明確
- [ ] 環境変数が文書化されている
- [ ] Slack App設定手順が記載されている

---

### Task 7-3: デプロイガイド作成（オプション）
**Priority**: P3 (Low)
**Dependencies**: Task 7-2
**Estimated Complexity**: Low

**Description**:
- Vercelデプロイ手順
- Cloudflare Workersデプロイ手順
- AWS Lambdaデプロイ手順
- 環境変数設定
- SQLiteストレージ設定（LibSQL）

**Acceptance Criteria**:
- [ ] 各プラットフォームのデプロイ手順が記載されている
- [ ] 本番環境設定が文書化されている

---

## 実装の優先順位とマイルストーン

### Milestone 1: 基盤とMastraコア（Week 1）
- Phase 0: プロジェクト基盤セットアップ（Task 0-1 ~ 0-5）
- Phase 1: データベース層（Task 1-1 ~ 1-2）
- Phase 2: Mastra初期化とエージェント（Task 2-1 ~ 2-4）

**Goal**: Mastraが起動し、エージェントが動作する状態

---

### Milestone 2: Workflowコア（Week 2）
- Phase 2: Workflow実装（Task 2-5 ~ 2-11）

**Goal**: すべてのWorkflowステップが実装され、単体で動作する状態

---

### Milestone 3: Slack統合（Week 3）
- Phase 3: Slack統合（Task 3-1 ~ 3-4）

**Goal**: `/research` コマンドからWorkflowが実行され、承認フローが動作する状態

---

### Milestone 4: 期限管理と仕上げ（Week 4）
- Phase 4: 期限管理（Task 4-1）
- Phase 5: エラーハンドリング（Task 5-1 ~ 5-3）
- Phase 6: メインエントリーポイント（Task 6-1）
- Phase 7: テスト & ドキュメント（Task 7-1 ~ 7-2）

**Goal**: 完全に動作するMVPが完成

---

## 依存関係マトリックス

| Task | Depends On | Blocks |
|------|-----------|--------|
| 0-1 | なし | 0-2, 0-5, 1-1 |
| 0-2 | 0-1 | 0-3 |
| 0-3 | 0-2 | 0-4 |
| 0-4 | 0-3 | すべての実装タスク |
| 0-5 | 0-1 | 1-2, 3-1, 5-1 |
| 1-1 | 0-5 | 1-2 |
| 1-2 | 1-1 | 2-1, 3-2 |
| 2-1 | 1-2 | 2-2, 5-3 |
| 2-2 | 2-1 | 2-3, 2-4 |
| 2-3 | 2-2 | 2-8 |
| 2-4 | 2-2 | 2-5 |
| 2-5 | 2-4 | 2-6 |
| 2-6 | 2-5 | 2-7, 3-3 |
| 2-7 | 2-6 | 2-8 |
| 2-8 | 2-3, 2-7 | 2-10 |
| 2-9 | 2-8 | 2-11 |
| 2-10 | 2-8 | 2-11 |
| 2-11 | 2-9, 2-10 | 3-2 |
| 3-1 | 0-5 | 3-2 |
| 3-2 | 3-1, 2-11 | 3-3 |
| 3-3 | 3-2 | 3-4 |
| 3-4 | 3-3 | 4-1, 6-1 |
| 4-1 | 3-4 | 6-1, 5-4 |
| 5-1 | 0-5 | 5-2 |
| 5-2 | 5-1 | なし |
| 5-3 | 2-1 | なし |
| 5-4 | 4-1 | なし |
| 6-1 | 3-4, 4-1 | 7-1 |
| 7-1 | 6-1 | 7-2 |
| 7-2 | 7-1 | 7-3 |
| 7-3 | 7-2 | なし |

---

## リスクと注意事項

### 技術的リスク

1. **@mastra/core 0.24.0の安定性**
   - **Risk**: 最新バージョンのため未知のバグの可能性
   - **Mitigation**: 早期にsuspend/resumeの動作確認を実施（Task 2-6）
   - **Fallback**: 問題があれば0.23.xにダウングレード

2. **Slack Chat Streaming APIの動作**
   - **Risk**: 比較的新しいAPI（2025年10月リリース）
   - **Mitigation**: Task 3-3で早期に動作確認
   - **Fallback**: 通常のchat.updateで代替可能

3. **streamVNext()の安定性**
   - **Risk**: 実験的APIのため将来変更の可能性
   - **Mitigation**: Mastraの公式ドキュメントを定期的に確認
   - **Fallback**: 通常のworkflow実行 + ポーリングで代替

### 運用リスク

1. **期限チェックジョブの信頼性**
   - **Risk**: アプリ再起動時にcronが停止
   - **Mitigation**: プロセスマネージャー（PM2等）で自動再起動
   - **Future**: 外部cronサービス（GitHub Actions等）への移行

2. **データベース接続**
   - **Risk**: SQLiteファイルのロック競合やI/Oエラー
   - **Mitigation**: リトライロジックの実装（Task 1-2）とDBファイルの永続ストレージ配置
   - **Monitoring**: エラーをログ監視し、ディスク使用量を定期チェック

### スコープリスク

1. **複数ワークスペース対応**
   - **Current Scope**: 単一ワークスペース
   - **Future**: マルチテナント対応が必要になる可能性

2. **高度な承認ワークフロー**
   - **Current Scope**: 単純な承認/差戻し
   - **Future**: 複数承認者、段階承認の要望

---

## 次のステップ

1. **Immediate**: Phase 0のセットアップを開始（Task 0-1）
2. **Week 1 Goal**: Milestone 1完了（Mastraコア動作確認）
3. **Week 2 Goal**: Milestone 2完了（Workflow実装完了）
4. **Week 3 Goal**: Milestone 3完了（Slack統合完了）
5. **Week 4 Goal**: Milestone 4完了（MVP完成）

---

## 参考資料

- [Mastra Deep Research Template](https://github.com/mastra-ai/template-deep-research)
- [Mastra Suspend & Resume Docs](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js)
- [Slack Chat Streaming API](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)
- [設計書v2](./docs/designe/revised-mastra-design.md)
