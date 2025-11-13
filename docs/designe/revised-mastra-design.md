# Mastra × Slack × Deep Research（HITL承認）

## 設計書v2：Mastraネイティブ機能最大活用版（開発・本番両対応）

---

## 0. 目的（Purpose）

MastraとSlackでHuman-in-the-Loop（HITL）型のDeep Researchワークフローを実現し、**Mastraのネイティブ機能を最大限活用**した効率的なMVPを構築する。

* Slack から Deep Research を起動し、**本調査に入る前に AI が作る「調査方針（Plan）」を人が承認（HITL）**してからのみ調査を実行する。
* 生成中・調査中は **Slack のメッセージ更新**で段階的に進捗を見せ、**最終レポートを同じチャンネルに配信**する。
* **Mastraの公式Deep Researchテンプレートをベース**に、Slack統合を追加したMVPを確立する。

---

## 1. スコープ / 非スコープ

**スコープ（MVP）**

* Slack App は **Socket Mode / Events API 両対応**（Slack推奨パターン）
  * **開発時**: Socket Mode（公開URL不要、開発が簡単）
  * **本番時**: Events API (HTTP)（スケーラブル、App Directory公開可能）
  * 切り替え: 環境変数で簡単に変更可能
  * デプロイ先（本番）: Vercel/Cloudflare Workers/AWS Lambda等
* **Mastraの公式Deep Researchテンプレート**をベースに実装
* Mastra Workflow：
  * `suspend()`/`resume()` による承認ゲート
  * `streamVNext()` による進捗ストリーミング（実験的APIだが推奨）
  * Nested workflowsによる処理の階層化
* **承認前は検索を走らせない**
* 状態管理は **Mastra Workflow Snapshots**（自動永続化）
* Slack固有情報のみ補助テーブルで管理（最小限）
* **Slack Chat Streaming API** でリアルタイム進捗配信
  * `chat.startStream` / `chat.appendStream` / `chat.stopStream`
  * Events APIと互換性あり

**非スコープ（MVP外）**

* 永続キューや Redis、RAG 大規模化、厳格 RBAC
* PDF/Slides 出力
* 高度な承認ワークフロー（複数承認者、段階承認など）
* **複数ワークスペースへの同時配信**（初期は単一ワークスペース想定）

---

## 2. ユースケース / ユーザーストーリー

* **UC-1 起票**：依頼者が `/research テーマ` を実行
* **UC-2 方針確認**：システムが方針ドラフト（Markdown）を生成し、Slackに投稿 → レビュアが **承認 / 差戻し** を選択
* **UC-3 進捗可視化**：関係者が方針生成中・本調査中の **進捗メッセージ** を閲覧
* **UC-4 受領**：依頼者が **最終レポート（Markdown）** を同チャンネルで受け取る

---

## 3. 画面・メッセージ（ノンコード仕様）

### 方針ドラフト提示（承認 UI）

```
📋 調査方針（ドラフト）— 承認してください

【目的】
○○について調査し、△△を明らかにする

【範囲】
・対象: ○○
・地域: グローバル
・期間: 2024-2025

【仮説】
1. ○○である可能性が高い
2. △△の影響が見られる

【観点】
- 市場動向
- 競合分析
- 技術トレンド

【主要ソース候補】
- 公式ドキュメント
- 業界レポート
- 技術ブログ

【成果物構成】
1. エグゼクティブサマリー
2. 詳細分析
3. 推奨アクション

[✅ 承認して本調査を開始]  [❌ 差し戻し]
```

### 本調査の進捗

```
🔍 調査中...

✓ Web検索: "○○ 市場動向" を実行
✓ 3件の関連記事を発見
✓ 記事を分析中...
✓ 主要な学習内容を抽出

✓ フォローアップ検索: "△△ 技術比較" を実行
...

⏳ レポートを生成中...
```

### 最終レポ（Markdown）

```
📊 調査レポート: ○○について

## エグゼクティブサマリー
...

## 主要な発見
...

## 推奨アクション
...

## 参考資料
...
```

---

## 4. シーケンス（テキスト図）

```
User → Slack（/research）
Slack → Slack App（Socket Mode [開発] / Events API [本番]）→ Mastra Workflow start

[Mastra mainWorkflow]
  ├─ [researchWorkflow]
  │   ├─ planStep: 方針生成（Agent + Chat Streaming → Slackへリアルタイム配信）
  │   ├─ approvalStep: suspend() → Slack承認ボタン表示
  │   │   ├─ [承認] Slack Interactive → resume({ approved: true })
  │   │   └─ [差戻し] Slack Interactive → resume({ approved: false })
  │   └─ gatherStep: 情報収集（承認後のみ）
  │
  └─ [deliverWorkflow]
      └─ generateReportStep: 最終レポート生成 → Slack投稿

[Persistence]
  ├─ Mastra workflow_snapshots（自動管理）
  └─ slack_metadata（補助テーブル：Slack固有情報のみ）
```

---

## 5. 構成（テキスト図｜Mastraネイティブ活用）

```
[User] --Slack UI--> [Slack Platform]
                          │
                          ├─ [開発] Socket Mode (WebSocket)
                          └─ [本番] Events API (HTTPS)
                          ▼
                    [Slack Bolt App]
                    ├─ 開発: ローカル実行（Socket Mode）
                    └─ 本番: Vercel/Cloudflare/Lambda（Events API）
                          │（/research handler）
                          │（Interactive handler: 承認/差戻し）
                          │（Chat Streaming: リアルタイム配信）
                          ▼
                   [Mastra Workflow]
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
[researchWorkflow]  [deliverWorkflow]  [Background Job]
      │                   │              （期限チェック）
      ├─ planStep         │
      ├─ approvalStep ←───┘
      │   (suspend/resume)
      └─ gatherStep
          │
          ▼
       [Web Search]
       (Exa API等)

[Persistence Layer]
  ├─ workflow_snapshots (Mastra managed, LibSQL/Postgres)
  │   ├─ runId, status, context, suspended steps
  │   ├─ step payloads (suspendPayload, resumePayload)
  │   └─ workflow state
  │
  └─ slack_metadata (補助テーブル, SQLite/Postgres)
      ├─ run_id (FK to workflow_snapshots)
      ├─ channel_id
      ├─ message_ts
      ├─ thread_ts
      ├─ requester
      └─ deadline_at
```

---

## 6. データ設計（Mastraネイティブ活用版）

### 6.1 Mastraネイティブ機能で管理（自動）

Mastraが自動的に `workflow_snapshots` テーブルで管理:

```typescript
// Mastraが自動保存する内容
{
  runId: "uuid",
  status: "suspended" | "success" | "failed",
  context: {
    "plan-step": {
      status: "success",
      output: { plan: "..." }
    },
    "approval-step": {
      status: "suspended",
      suspendPayload: {
        plan: "...",
        requestedAt: 1234567890
      },
      resumePayload: null  // resume後に記録される
    }
  },
  timestamp: 1234567890
}
```

### 6.2 補助テーブル（Slack固有情報のみ）

**slack_metadata**

最小限のSlack固有情報のみを管理:

```sql
CREATE TABLE slack_metadata (
  run_id TEXT PRIMARY KEY,        -- Mastra workflow run ID
  channel_id TEXT NOT NULL,       -- Slackチャンネル
  message_ts TEXT,                -- 方針投稿のタイムスタンプ
  thread_ts TEXT,                 -- スレッドTS（あれば）
  requester TEXT NOT NULL,        -- 依頼者のSlack User ID
  deadline_at INTEGER NOT NULL,   -- 承認期限（Unix timestamp）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_slack_metadata_deadline ON slack_metadata(deadline_at);
```

**設計方針**:
- ✅ Workflow状態はMastraが管理 → 独自テーブル不要
- ✅ Slack固有情報のみ補助テーブルで管理
- ✅ `run_id` で Mastra workflow と紐付け
- ✅ 期限管理のみ独自実装（背景ジョブ）

---

## 7. 状態遷移（Mastraワークフロー）

Mastraの workflow status:

```
CREATED (workflow.createRunAsync())
    ↓
RUNNING (run.start())
    ↓
SUSPENDED (approvalStep.suspend())
    ├─ [承認] → resume({ approved: true }) → RUNNING → SUCCESS
    ├─ [差戻し] → resume({ approved: false }) → FAILED
    └─ [期限切れ] → resume({ approved: false, reason: 'timeout' }) → FAILED
```

---

## 8. 期限/TTL（背景ジョブで実装）

### 期限管理の実装

**承認待ち期限**: デフォルト 24h

```typescript
// 定期ジョブ（15分毎）
import cron from 'node-cron';

cron.schedule('*/15 * * * *', async () => {
  const storage = mastra.getStorage();
  const now = Date.now();

  // 期限切れの承認待ちを検索
  const expiredApprovals = await db.query(`
    SELECT sm.run_id, sm.channel_id, sm.message_ts
    FROM slack_metadata sm
    JOIN workflow_snapshots ws ON ws.runId = sm.run_id
    WHERE ws.status = 'suspended'
      AND sm.deadline_at < ?
  `, [now]);

  for (const approval of expiredApprovals) {
    // Slackに期限切れ通知
    await slackClient.chat.postMessage({
      channel: approval.channel_id,
      thread_ts: approval.message_ts,
      text: '⏰ 承認期限が切れました。調査は自動的にキャンセルされました。'
    });

    // Workflowを終了（差戻し扱い）
    const workflow = mastra.getWorkflow('mainWorkflow');
    const run = await workflow.getRunAsync(approval.run_id);
    await run.resume({
      step: 'approval-step',
      resumeData: {
        approved: false,
        reason: 'timeout',
        approver: 'system'
      }
    });
  }
});
```

---

## 9. エラーハンドリング（方針）

* 方針生成失敗：短い失敗通知＋Mastraのworkflow error status
* 承認期限切れ：`TIMEOUT` 化・通知・workflow終了
* ストリーミング失敗：通常メッセージで代替し続行
* 重複クリック：Mastraが `resumeData` でidempotencyを保証
* Slack API失敗：リトライ（3回）+ fallback通知

---

## 10. 受け入れ基準（Acceptance）

* `/research` 実行で **方針ドラフトが段階的に表示** される
* **承認が来るまで gather に進まない**（suspend/resume）
* **差戻しで終了**（`resumeData.approved === false`）
* **承認後に進捗更新 → 最終レポ投稿**
* 再起動しても **承認待ちが消えない**（Mastra snapshots永続化）
* 承認期限（24h）を超えたら自動終了

---

## 11. 運用・バックアップ

### データベース

* **開発**: `LibSQLStore({ url: 'file:./mastra.db' })`
* **本番**: `PostgresStore({ connectionString: process.env.DATABASE_URL })`

### バックアップ

* Mastra workflow_snapshots: DB標準のバックアップ
* slack_metadata: 同上
* 開発時は手動コピーで十分

### 監視

* Mastra Observability: AI Tracing + OTEL
* Slack承認率・期限切れ率をメトリクス化

---

## 12. 今後の拡張（移行計画）

* **承認待ち/TTL**: Redis（短命キー）へ移行可能（現状は不要）
* **監査/KPI**: Postgres（Supabase）継続利用
* **可観測性**: Langfuse（`plan→hitl→gather→synth→deliver` トレース）
* **疎結合**: Queue（SQS/PubSub）と Worker 分離
* **差戻し理由**: Slackモーダルで必須化
* **Slack App Directory公開**:
  * 既にEvents API対応済みなので、本番環境（`SLACK_SOCKET_MODE=false`）で公開申請可能
  * 必要に応じてVercel/AWS Lambda等にデプロイ
  * 参考: [Slack App Directory](https://slack.com/apps)

---

## 13. 技術スタック（Mastraネイティブ活用版）

### ランタイム & 言語

* Node.js 18+
* TypeScript（`strict`／`noImplicitAny`）
* ESM modules

### Mastra

* **Core**: `@mastra/core@latest`
* **Storage**:
  * 開発: `@mastra/libsql` (SQLite)
  * 本番: `@mastra/pg` (PostgreSQL)
* **Workflows**:
  * `createWorkflow`, `createStep`
  * `suspend()`, `resume()`
  * `streamVNext()`
* **Observability**:
  * AI Tracing（デフォルト有効）
  * OTEL Tracing（オプション）
* **公式テンプレート**: [template-deep-research](https://github.com/mastra-ai/template-deep-research) をベース

### Slack

* **SDK**: `@slack/bolt` (Socket Mode / Events API 両対応)
* **スコープ**: `commands`, `chat:write`, `chat:write.public`
* **実行環境**:
  * 開発: ローカル（Socket Mode、公開URL不要）
  * 本番: Vercel / Cloudflare Workers / AWS Lambda（Events API）
* **機能**:
  * Slash command: `/research`
  * Interactive components: 承認/差戻しボタン
  * **Chat Streaming API**: `chat.startStream`, `chat.appendStream`, `chat.stopStream`
    * リアルタイムで進捗をストリーミング配信
    * Socket Mode / Events API両方で動作

### データストア

* **Workflow状態**: Mastra workflow_snapshots（自動管理）
* **Slack情報**: `slack_metadata` テーブル（補助）
* **期限処理**: 定期ジョブ（`node-cron`）で24h → TIMEOUT

### 観測/ログ

* Mastra AI Tracing（built-in）
* `PinoLogger` (structured logging)
* KPI: 承認までの時間／差戻し率／TIMEOUT 件数

### セキュリティ

* Secrets：Slack トークン・検索 API キーは環境変数（`.env`）
* 最小権限：`commands` / `chat:write`
* 承認者制御（任意）：チャンネルメンバー

### テスト & 検証

* 対話 E2E：`/research` → 方針 → 承認 → 最終レポ
* 耐障害：再起動後の承認待ち存続、期限切れ遷移、重複クリック無視

### 開発環境

* **開発時**: ローカル実行（Socket Mode、**ngrok 不要**）
* **本番時**: Vercel/Cloudflare Workers/AWS Lambda（Events API）
* パッケージマネージャー: pnpm
* Lint/Format：ESLint + Prettier
* リポ構成：
  ```
  /src
    /mastra
      /agents
      /tools
      /workflows
      index.ts
    /slack
      bolt-app.ts
      handlers/
    index.ts
  /data
    mastra.db (gitignore)
  /docs
    /designe
  ```

---

## 14. 実装の詳細設計

### 14.1 Mastra Workflow定義

#### mainWorkflow（メインオーケストレーション）

```typescript
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

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

#### researchWorkflow（調査 + HITL承認）

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// Step 1: 方針生成
const planStep = createStep({
  id: 'plan-step',
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    plan: z.string(),
  }),
  stateSchema: z.object({
    channelId: z.string(),
    userId: z.string(),
    messageTs: z.string().optional(),
  }),
  execute: async ({ inputData, mastra, writer, state, setState }) => {
    const researchAgent = mastra.getAgent('researchAgent');

    // 方針を生成（ストリーミング）
    const stream = await researchAgent.stream(
      `Create a research plan for: "${inputData.query}"`
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

// Step 2: HITL承認ゲート
const approvalStep = createStep({
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

// Step 3: 情報収集（承認後のみ）
const gatherStep = createStep({
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
      throw new Error('Research was rejected');
    }

    const researchAgent = mastra.getAgent('researchAgent');

    // Web検索 + 分析
    const result = await researchAgent.generate(
      `Execute research based on plan: ${inputData.plan}`,
      {
        maxSteps: 10,
        tools: ['webSearchTool', 'evaluateResultTool'],
      }
    );

    // 進捗をSlackに配信
    await writer?.write({
      type: 'gather-progress',
      message: 'Research completed',
    });

    return { researchData: result };
  },
});

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

#### deliverWorkflow（レポート生成）

```typescript
const generateReportStep = createStep({
  id: 'generate-report-step',
  inputSchema: z.object({
    researchData: z.any(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const reportAgent = mastra.getAgent('reportAgent');

    const result = await reportAgent.generate(
      `Generate a comprehensive report based on: ${JSON.stringify(inputData.researchData)}`
    );

    return { report: result.text };
  },
});

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

### 14.2 Slack統合

#### Bolt App初期化（開発・本番両対応）

```typescript
import { App } from '@slack/bolt';
import { mastra } from './mastra';

// 環境変数で Socket Mode / Events API を切り替え
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,

  // Socket Mode設定（開発時のみ）
  socketMode: process.env.SLACK_SOCKET_MODE === 'true',
  appToken: process.env.SLACK_APP_TOKEN, // Socket Mode時のみ必要
});

// /research コマンド
app.command('/research', async ({ command, ack, client }) => {
  await ack();

  const query = command.text;
  const channelId = command.channel_id;
  const userId = command.user_id;

  // Workflowを開始
  const workflow = mastra.getWorkflow('slack-research-hitl');
  const run = await workflow.createRunAsync();

  // Slack補助テーブルに記録
  await db.run(`
    INSERT INTO slack_metadata (run_id, channel_id, requester, deadline_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    run.runId,
    channelId,
    userId,
    Date.now() + 24 * 60 * 60 * 1000, // 24時間後
    Date.now(),
    Date.now(),
  ]);

  // Slack Chat Streaming API で初期ストリーム開始
  const streamResponse = await client.chat.startStream({
    channel: channelId,
    text: `🔍 調査を開始します: "${query}"\n\n`,
  });

  const messageTs = streamResponse.ts;

  // message_tsを保存
  await db.run(`
    UPDATE slack_metadata SET message_ts = ? WHERE run_id = ?
  `, [messageTs, run.runId]);

  // Workflowをストリーミング実行
  const stream = await run.streamVNext({
    inputData: { query, channelId, userId },
  });

  for await (const event of stream) {
    if (event.type === 'plan-chunk') {
      // 方針生成の進捗をリアルタイムでストリーミング
      await client.chat.appendStream({
        channel: channelId,
        ts: messageTs,
        text: event.chunk,
      });
    }

    if (event.type === 'gather-progress') {
      // 情報収集の進捗もストリーミング
      await client.chat.appendStream({
        channel: channelId,
        ts: messageTs,
        text: `\n\n${event.message}`,
      });
    }

    if (event.type === 'step-end' && event.payload.stepName === 'approval-step') {
      if (event.payload.status === 'suspended') {
        // ストリーミングを終了
        await client.chat.stopStream({
          channel: channelId,
          ts: messageTs,
        });

        // 承認ボタンを追加
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '📋 調査方針が生成されました。承認してください。' },
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

    if (event.type === 'workflow-finish') {
      // Workflow完了時にストリーミングを終了
      await client.chat.stopStream({
        channel: channelId,
        ts: messageTs,
      });
    }
  }
});

// 承認ボタンハンドラ
app.action('approve', async ({ ack, body, client }) => {
  await ack();

  const runId = body.actions[0].value;
  const userId = body.user.id;

  // Workflowを再開
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
    channel: body.channel.id,
    ts: body.message.ts,
    text: '✅ 承認されました。本調査を開始します...',
    blocks: [], // ボタンを削除
  });
});

// 差戻しボタンハンドラ
app.action('reject', async ({ ack, body, client }) => {
  await ack();

  const runId = body.actions[0].value;
  const userId = body.user.id;

  // Workflowを終了
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
    channel: body.channel.id,
    ts: body.message.ts,
    text: '❌ 差し戻されました。調査は中止されました。',
    blocks: [],
  });
});

// 起動（Socket Mode / Events API 両対応）
await app.start(process.env.PORT || 3000);

if (process.env.SLACK_SOCKET_MODE === 'true') {
  console.log('⚡️ Slack Bolt app is running in Socket Mode!');
} else {
  console.log(`⚡️ Slack Bolt app is running on port ${process.env.PORT || 3000} (Events API)!`);
}
```

**環境変数設定例**:

```bash
# 開発環境 (.env.development)
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-xxx
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx

# 本番環境 (.env.production)
SLACK_SOCKET_MODE=false
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx
PORT=3000
```

---

## 15. 成功基準（KGI/KPIの初期設定）

* **KGI**：調査開始から納品までのリードタイム短縮／方針差戻し率の逓減
* **KPI**：
  * 承認までの中央値（目標: < 2時間）
  * 差戻し率（目標: < 20%）
  * TIMEOUT 率（目標: < 5%）
  * 最終レポ提出率（目標: > 90%）
  * Workflow実行時間（目標: < 5分）

---

## 16. マイグレーションガイド（初期設計からの変更点）

### 削除された要素

* ❌ `approvals` テーブル → Mastra workflow snapshotsで代替
* ❌ `events` テーブル → Mastra observability/tracingで代替
* ❌ `artifacts` テーブル → Mastra workflow contextで代替
* ❌ 独自のステート管理ロジック → Mastra workflow stateで代替

### 追加された要素

* ✅ `slack_metadata` テーブル（Slack固有情報のみ）
* ✅ Mastra workflow streaming (`streamVNext()` - 実験的APIだが推奨)
* ✅ Slack Chat Streaming API (`chat.startStream`, `chat.appendStream`, `chat.stopStream`)
* ✅ Nested workflows (researchWorkflow, deliverWorkflow)
* ✅ 定期ジョブ（期限チェック）

### メリット

* 🎯 実装コード量が**約50%削減**（Mastraネイティブ機能活用）
* 🎯 スキーマ管理不要（Mastraが自動管理）
* 🎯 トレーサビリティ向上（Observability統合）
* 🎯 スケーラビリティ向上（Mastraのベストプラクティス準拠）

---

## 参考

### Mastra公式
- [Mastra Official Docs](https://mastra.ai/docs)
- [Mastra Deep Research Template](https://github.com/mastra-ai/template-deep-research)
- [Mastra Workflows Overview](https://mastra.ai/docs/workflows/overview)
- [Mastra Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Mastra Human-in-the-Loop](https://mastra.ai/docs/workflows/human-in-the-loop)
- [Mastra Workflow Streaming](https://mastra.ai/docs/streaming/workflow-streaming)

### Slack公式
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js)
- [Slack Socket Mode](https://api.slack.com/apis/connections/socket)
- [Slack Chat Streaming API](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)
- [Socket Mode vs HTTP Mode](https://docs.slack.dev/apis/events-api/comparing-http-socket-mode/)
