# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Slackから実行できるAI調査ワークフローシステム。AIが生成した調査計画を人間が承認した後、深い調査を実行し、進捗とレポートをリアルタイムでSlackにストリーミング配信する**Human-In-The-Loop (HITL)** システム。調査結果に対するフィードバック収集機能も実装。

## 開発コマンド

### 開発サーバー起動

```bash
# Mastra Studioを起動（推奨: ワークフロー/エージェントのテスト用）
pnpm run dev:mastra

# Slack Appのみを起動
pnpm run dev:slack

# LangWatch（オブザーバビリティプラットフォーム）を起動
docker compose up -d --wait
# ダッシュボード: http://localhost:5560
```

### ビルドとテスト

```bash
# 型チェック
pnpm run typecheck

# Lint
pnpm run lint
pnpm run lint:fix

# フォーマット
pnpm run format
pnpm run format:check

# ビルド
pnpm run build

# 本番起動
pnpm run start
```

### データベース操作

```bash
# マイグレーション生成
pnpm run db:generate

# マイグレーション適用
pnpm run db:migrate
```

## アーキテクチャ

### コアコンポーネント

#### 1. Mastraワークフロー (`src/mastra/`)

- **メインワークフロー** (`workflows/main-workflow.ts`): `researchWorkflow` → `deliverWorkflow` の順で実行
- **researchWorkflow**: `planStep` → `approvalStep` → `gatherStep` の3段階
- **deliverWorkflow**: `generateReportStep` でレポート生成

**重要**: ワークフローは**ネストされたワークフロー構造**。`main-workflow.ts`が2つのサブワークフローを統合。

#### 2. HITL承認フロー (`workflows/steps/approval-step.ts`)

```typescript
// approvalStepの動作フロー
if (!resumeData) {
  // 初回実行: 承認待ちで一時停止
  return context.suspend({ plan, requestedAt });
}
// resume時: 承認/差戻しの結果を返す
return { approved, approver, reason };
```

**重要な仕様**:
- `suspend()`を呼び出すとワークフローが一時停止し、`suspended`状態になる
- Slackボタンクリック時に`resume()`が呼び出され、ワークフローが再開される
- `@mastra/core@0.24.0`以上が必須（suspend/resumeの修正が含まれる）

#### 3. Slackストリーミング統合 (`src/slack/`)

**Slack Chat Streaming API**を使用してワークフロー進捗をリアルタイム配信:

- `chat.startStream()`: ストリーミング開始
- `chat.appendStream()`: 増分テキスト配信
- `chat.stopStream()`: ストリーミング終了

**スレッド構造**:
- `parentTs`: 親メッセージのタイムスタンプ（調査開始メッセージ）
- `streamTs`: ストリーミングメッセージのタイムスタンプ（`thread_ts`として`parentTs`を指定）

#### 4. データベース層 (`src/db/`)

**Drizzle ORM + LibSQL**を使用。3つのテーブルで関心を分離:

```typescript
// スキーマ定義（schema.ts）
// 1. Slackメタデータ（メッセージTS、承認期限など）
export const slackMetadata = sqliteTable('slack_metadata', {
  runId: text('run_id').primaryKey(),
  channelId: text('channel_id').notNull(),
  messageTs: text('message_ts'),              // 親メッセージTS
  threadTs: text('thread_ts'),                // ストリーミングメッセージTS
  approvalMessageTs: text('approval_message_ts'), // 承認メッセージTS
  requester: text('requester').notNull(),
  deadlineAt: integer('deadline_at').notNull(),
  // ...
});

// 2. 調査実行内容（クエリ、計画、レポート）
export const slackResearchRuns = sqliteTable('slack_research_runs', {
  runId: text('run_id').primaryKey().references(() => slackMetadata.runId),
  query: text('query'),
  plan: text('plan'),
  report: text('report'),
  // ...
});

// 3. フィードバック
export const slackFeedbacks = sqliteTable('slack_feedbacks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull().references(() => slackResearchRuns.runId),
  feedbackType: text('feedback_type', { enum: ['positive', 'negative'] }).notNull(),
  userId: text('user_id').notNull(),
  messageTs: text('message_ts'),
  // ...
});
```

**重要**:
- `messageTs`（親）と`threadTs`（ストリーミング）を区別すること
- すべてのテーブルに`slack_*`プレフィックスを付け、Mastraテーブル（`mastra_*`）と分離
- drizzle.config.tsで`tablesFilter: ['slack_*']`を使用してMastraテーブルに影響を与えない

#### 5. エージェント (`src/mastra/agents/`)

- **research-agent**: 調査計画生成 + Tavily MCP検索実行
- **report-agent**: 最終レポート生成

**Tavily MCP統合** (`src/mcp/tavily-client.ts`):
```typescript
const tavilyTools = await tavilyMcpClient.getTools();
// research-agentに直接登録
tools: { ...tavilyTools, 'evaluate-result': evaluateResultTool }
```

#### 6. LangWatchオブザーバビリティ (`src/observability/`) - オプション

**LangWatch**を使用してワークフロー全体をトレース・評価する最小限の統合。

- **setup.ts**: LangWatch初期化
- **tracers.ts**: シンプルなトレーサー（`traceWorkflow`ヘルパー関数のみ）
- **evaluators.ts**: レポート品質評価（完全性、関連性、読みやすさ）

**トレーシング対象（3箇所のみ）**:
```
1. slack-research-command (research-handler.ts)
   └─ Slackコマンド受信〜完了

2. main-workflow (main-workflow.ts)
   └─ ワークフロー全体の実行

3. generate-report-step (generate-report-step.ts)
   └─ レポート生成 + 品質評価
```

**評価機能**:
- レポート品質の自動評価（0.0〜1.0スコア）
- GPT-4o-miniを使用した評価理由の生成

**ダッシュボード**: http://localhost:5560 でトレース・評価結果を可視化

**重要**: DBスキーマ変更なし、suspend/resumeのスパン継続なし。詳細は `docs/langwatch-integration.md` を参照。

### ワークフローの実行フロー

```
1. /research コマンド受信
   ↓
2. mainWorkflow.createRunAsync() でワークフロー開始
   ↓ (queryをslack_research_runsに保存)
3. planStep: 調査計画生成（ストリーミング）
   ↓ (planをslack_research_runsに保存)
4. approvalStep: suspend() で一時停止 → Slackに承認ボタン表示
   ↓
5. ユーザーがボタンクリック → resume() で再開
   ↓
6. gatherStep: Tavily検索で情報収集
   ↓
7. generateReportStep: レポート生成
   ↓ (reportをslack_research_runsに保存)
8. Slackにレポート投稿 + フィードバックボタン表示
   ↓
9. ユーザーがフィードバックボタンをクリック
   ↓ (feedbackをslack_feedbacksに保存)
10. 完了
```

### イベント駆動設計

ワークフローはカスタムイベントを`writer.write()`で送信:

```typescript
// planStepから
await writer?.write({ type: 'plan-chunk', chunk });

// gatherStepから
await writer?.write({ type: 'gather-progress', message, details });
```

これらのイベントは`streaming-handler.ts`で受信し、Slackにストリーミング配信される。

## 重要な設計パターン

### 1. suspend/resumeパターン

```typescript
// approvalStep内
if (!resumeData) {
  return context.suspend(payload);  // 一時停止
}
return processResumeData(resumeData); // 再開時の処理
```

### 2. ストリーミングハンドラのイベントループ

```typescript
for await (const event of stream) {
  if (event.type === 'plan-chunk') { /* ... */ }
  if (event.type === 'step-end' && event.payload.stepName === 'approval-step') {
    if (event.payload.status === 'suspended') {
      // 承認ボタンを表示
    }
  }
  if (event.type === 'workflow-finish') { /* ... */ }
}
```

### 3. Slack API呼び出しの型安全性

`chat-stream.ts`で`SlackClientWithChat`型を定義し、Streaming API互換性を確保:

```typescript
export type SlackClientWithChat = WebClient & {
  chat: ChatStreamMethods;
};
```

### 4. リポジトリパターン

3つのリポジトリでデータアクセスを抽象化:

```typescript
// SlackMetadataRepository: Slackメタデータ管理
const metadataRepo = await getSlackMetadataRepository();
await metadataRepo.create({ runId, channelId, requester, deadlineAt });
await metadataRepo.updateMessageTs(runId, messageTs);
await metadataRepo.getExpiredApprovals(now);

// ResearchRunsRepository: 調査内容管理
const researchRepo = await getResearchRunsRepository();
await researchRepo.create({ runId, query });
await researchRepo.updatePlan(runId, plan);
await researchRepo.updateReport(runId, report);

// FeedbacksRepository: フィードバック管理
const feedbackRepo = await getFeedbacksRepository();
await feedbackRepo.create({ runId, feedbackType: 'positive', userId });
await feedbackRepo.getByRunId(runId);
```

すべてのリポジトリでSQLiteのロック競合に対応するリトライロジックを実装。

## 環境変数

### 開発環境（Socket Mode）

```bash
# Slack設定
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-xxx       # App-Level Token
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx

# データベース
DATABASE_URL=file:./data/mastra.db

# AI/MCP
OPENAI_API_KEY=sk-xxx
TAVILY_API_KEY=tvly-xxx

# ログ
LOG_LEVEL=debug

# LangWatch（オプション）
LANGWATCH_API_KEY=sk-lw-xxx    # http://localhost:5560 でサインアップ後に取得
LANGWATCH_ENDPOINT=http://localhost:5560
LANGWATCH_ENABLED=true
LANGWATCH_EVALUATION_MODEL=gpt-4o-mini  # 評価用モデル（デフォルト: gpt-4o-mini）
```

### 本番環境（Events API）

```bash
SLACK_SOCKET_MODE=false
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx
PORT=3000
DATABASE_URL=file:/var/lib/mastra/mastra.db
# ... その他同じ
```

## デバッグ方法

### ワークフロー状態の確認

```typescript
const run = await workflow.getRunAsync(runId);
const status = await run.getStatus(); // 'running' | 'suspended' | 'success' | 'failed'
```

### ログレベルの調整

`LOG_LEVEL=debug`でMastraの内部ログを確認可能。

### Mastra Studioでのテスト

`pnpm run dev:mastra`でブラウザ上でワークフロー/エージェントをテスト可能。Slack統合前にロジックを検証できる。

### LangWatchダッシュボードでのトレース確認

`docker compose up -d --wait`でLangWatchを起動後、http://localhost:5560 でアクセス。

**主要機能**:
- **Traces**: 全ワークフロー実行の一覧とフィルタリング
- **Trace Details**: 各ステップのスパンツリー、タイムライン、イベント
- **Evaluations**: レポート品質スコアと評価理由
- **Analytics**: 実行時間、エラー率、承認率の統計

**検索クエリ例**:
```
# エラーが発生したトレース
status = "error"

# 実行時間が30秒以上
duration > 30000

# 品質スコアが低いレポート
evaluation.overall_score < 0.6
```

## よくある問題と解決策

### 1. suspend/resumeが動作しない

- `@mastra/core`のバージョンが0.24.0以上であることを確認
- `suspendSchema`と`resumeSchema`が正しく定義されているか確認
- `resume()`時に`step`パラメータが正しく指定されているか確認

### 2. Slack Streaming APIエラー

- `recipient_team_id`と`recipient_user_id`が必須パラメータ
- `thread_ts`には親メッセージの`ts`を指定（ストリーミングメッセージのtsではない）

### 3. データベースマイグレーションエラー

```bash
# データベースを再作成
rm -rf data/mastra.db
pnpm run db:migrate
```

### 4. Tavily MCP接続エラー

- `TAVILY_API_KEY`が設定されているか確認
- `tavily-mcp`パッケージがインストールされているか確認

## コード変更時の注意点

### ワークフロースキーマ変更時

```typescript
// schemas.ts でZodスキーマを定義
export const workflowContextSchema = z.object({
  query: z.string(),
  channelId: z.string(),
  userId: z.string(),
});

// 各ステップのinputSchema/outputSchemaを更新
```

### 新しいエージェント追加時

```typescript
// 1. agents/内にエージェント定義
export const newAgent = new Agent({ id: 'new-agent', ... });

// 2. mastra/index.ts に登録
agents: {
  'research-agent': researchAgent,
  'report-agent': reportAgent,
  'new-agent': newAgent,  // 追加
}
```

### 新しいスラッシュコマンド追加時

```typescript
// 1. handlers/内にハンドラ作成
export const handleNewCommand = async ({ command, ack, client }) => { ... };

// 2. index.ts で登録
app.command('/new-command', handleNewCommand);
```

### 新しいSlackアクション追加時

```typescript
// 1. blocks/内にBlock Kit定義作成
export const buildNewActionBlocks = (runId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'new_action',
        text: { type: 'plain_text', text: 'アクション' },
        value: runId,
      },
    ],
  },
];

// 2. handlers/action-handler.ts にハンドラ追加
export const handleNewAction = async ({ ack, body, client }) => { ... };

// 3. index.ts で登録
app.action('new_action', handleNewAction);
```

## パフォーマンス最適化

### 1. ストリーミングチャンクサイズ

planStepでのテキスト配信は適度なチャンクサイズで送信（Slack API制限を考慮）。

### 2. データベースクエリ

`getExpiredApprovals()`は`deadlineAt`にインデックスを使用（`idx_slack_metadata_deadline`）。

### 3. 期限チェックジョブの頻度

デフォルトは15分毎（`*/15 * * * *`）。調整可能だが、Slack APIレート制限に注意。

## セキュリティ考慮事項

- `.env`ファイルは`.gitignore`に含める
- SlackトークンとAPIキーはローテーション可能にする
- 本番環境では`DATABASE_URL`を環境変数で管理し、ファイルパスをハードコードしない

## テストシナリオ

実装タスク（`docs/implementation-tasks.md`）のPhase 7に詳細なE2Eテストシナリオを記載。

## 参考資料

### コアフレームワーク
- [Mastra Documentation](https://mastra.ai/docs)
- [Mastra Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js)
- [Slack Chat Streaming API](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)
- [Drizzle ORM](https://orm.drizzle.team/)

### オブザーバビリティ
- [LangWatch Documentation](https://docs.langwatch.ai/)
- [LangWatch GitHub](https://github.com/langwatch/langwatch)
- [OpenTelemetry for JavaScript](https://opentelemetry.io/docs/languages/js/)

### プロジェクト固有ドキュメント
- `docs/langwatch-integration.md`: LangWatch統合の詳細実装計画
