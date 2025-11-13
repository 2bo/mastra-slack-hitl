# 設計変更ガイド：初期設計 → Mastraネイティブ活用版

## 変更の目的

初期設計では多くの機能を独自実装する想定でしたが、**Mastraが既に提供している強力な機能**を最大限活用することで、実装コストを削減し、保守性とスケーラビリティを向上させます。

---

## 主要な変更点

### 1. データモデルの大幅簡略化 ✨

#### Before（初期設計）
```sql
-- 独自に3つのテーブルを管理
CREATE TABLE approvals (
  id, request_id, resume_key, status,
  requester, channel, message_ts, deadline_at,
  decided_at, reason, created_at, updated_at
);

CREATE TABLE events (
  id, request_id, type, actor, meta, ts
);

CREATE TABLE artifacts (
  id, request_id, kind, title, summary,
  content_ref, hash, created_at
);
```

#### After（Mastraネイティブ活用版）
```sql
-- Mastraが自動管理（workflow_snapshots）
-- 追加するのはSlack固有情報のみ
CREATE TABLE slack_metadata (
  run_id TEXT PRIMARY KEY,        -- Mastra workflow run ID（FK）
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  thread_ts TEXT,
  requester TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**削減効果**:
- ❌ `approvals` テーブル → Mastra `workflow_snapshots.context` で管理
- ❌ `events` テーブル → Mastra Observability/Tracing で管理
- ❌ `artifacts` テーブル → Mastra `workflow_snapshots.context` で管理
- ✅ Slack固有情報のみ `slack_metadata` で管理

**メリット**:
- スキーマ定義・マイグレーション不要
- トランザクション整合性が保証される
- Observability/Tracingと自動統合

---

### 2. ワークフロー定義の変更

#### Before（初期設計の想定）
```typescript
// 独自のステップ管理
plan() → hitlPlan() → gather() → synthesize() → deliver()
```

#### After（Mastraネイティブ活用版）
```typescript
// Mastra Workflowによる構造化
mainWorkflow
  ├─ researchWorkflow (nested)
  │   ├─ planStep
  │   ├─ approvalStep (suspend/resume)
  │   └─ gatherStep
  └─ deliverWorkflow (nested)
      └─ generateReportStep
```

**変更のポイント**:
- ✅ `createWorkflow` と `createStep` による型安全な定義
- ✅ Nested workflowsで処理を階層化
- ✅ `suspend()`/`resume()` によるHITL実装
- ✅ `streamVNext()` による進捗配信

---

### 3. HITL（承認ゲート）の実装方法

#### Before（初期設計の想定）
```typescript
// 独自のapprovalテーブル + ポーリング
const approval = await db.get(`
  SELECT * FROM approvals WHERE request_id = ?
`, [requestId]);

if (approval.status === 'APPROVED') {
  // 次のステップへ
}
```

#### After（Mastraネイティブ活用版）
```typescript
// Mastraのsuspend/resumeを使用
const approvalStep = createStep({
  id: 'approval-step',
  suspendSchema: z.object({
    plan: z.string(),
    requestedAt: z.number(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    approver: z.string(),
  }),
  execute: async ({ resumeData, suspend }) => {
    if (!resumeData) {
      return await suspend({ plan: '...', requestedAt: Date.now() });
    }
    return { approved: resumeData.approved };
  },
});

// Slackボタンから再開
await run.resume({
  step: 'approval-step',
  resumeData: { approved: true, approver: userId },
});
```

**メリット**:
- ✅ Workflow状態の永続化が自動
- ✅ 再起動してもsuspend状態が保持される
- ✅ 冪等性が保証される（重複クリック対策）

---

### 4. ストリーミングの実装方法

#### Before（初期設計の想定）
```typescript
// Slackへの手動更新
let currentText = '';
for await (const chunk of llmStream) {
  currentText += chunk;
  await slackClient.chat.update({
    channel: channelId,
    ts: messageTs,
    text: currentText,
  });
}
```

#### After（Mastraネイティブ活用版）
```typescript
// Mastra streamingとSlackを統合
const stream = await run.streamVNext({ inputData });

for await (const event of stream) {
  if (event.type === 'plan-chunk') {
    // カスタムイベントをSlackに配信
    await slackClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: currentText + event.chunk,
    });
  }

  if (event.type === 'step-start') {
    // ステップ開始通知
    console.log(`Step ${event.payload.stepName} started`);
  }
}
```

**メリット**:
- ✅ Workflow全体の進捗をイベントストリームで取得
- ✅ カスタムイベント（`writer.write()`）で柔軟な配信
- ✅ Observabilityと自動連携

---

### 5. 期限管理の実装

#### Before（初期設計の想定）
```sql
-- approvalsテーブルでデッドラインを管理
UPDATE approvals
SET status = 'TIMEOUT'
WHERE deadline_at < ? AND status = 'WAITING';
```

#### After（Mastraネイティブ活用版）
```typescript
// slack_metadata + workflow_snapshotsを結合
const expiredApprovals = await db.query(`
  SELECT sm.run_id, sm.channel_id, sm.message_ts
  FROM slack_metadata sm
  JOIN workflow_snapshots ws ON ws.runId = sm.run_id
  WHERE ws.status = 'suspended'
    AND sm.deadline_at < ?
`, [Date.now()]);

for (const approval of expiredApprovals) {
  const run = await workflow.getRunAsync(approval.run_id);
  await run.resume({
    step: 'approval-step',
    resumeData: { approved: false, reason: 'timeout' },
  });
}
```

**変更のポイント**:
- ✅ Workflow状態はMastraが管理
- ✅ 期限情報のみ補助テーブルで管理
- ✅ `resume()` で統一的に処理

---

## 削除された要素

| 項目 | 理由 |
|------|------|
| `approvals` テーブル | Mastra `workflow_snapshots` で代替可能 |
| `events` テーブル | Mastra Observability/Tracing で代替可能 |
| `artifacts` テーブル | Mastra `workflow_snapshots.context` で代替可能 |
| 独自ステート管理ロジック | Mastra workflow stateで代替可能 |
| `resume_key` 生成ロジック | Mastraが自動生成 |
| ステータス遷移ロジック | Mastraが自動管理 |

---

## 追加された要素

| 項目 | 目的 |
|------|------|
| `slack_metadata` テーブル | Slack固有情報（channel, message_ts, deadline）の管理 |
| Nested workflows | 処理の階層化・再利用性向上 |
| `streamVNext()` | リアルタイム進捗配信 |
| `writer.write()` | カスタムイベント配信 |
| 定期ジョブ（cron） | 期限切れチェック |

---

## コード量の比較

### Before（初期設計の想定実装）
```
src/
  db/
    schema.sql           # 100行
    migrations/          # 50行
    repositories/        # 200行
  workflow/
    approval.ts          # 150行
    state-manager.ts     # 200行
    event-logger.ts      # 100行
  slack/
    app.ts               # 300行

合計: 約1,100行
```

### After（Mastraネイティブ活用版）
```
src/
  mastra/
    workflows/           # 200行（Mastra定義）
    agents/              # 100行
    index.ts             # 30行
  slack/
    app.ts               # 250行（Mastra統合）
  db/
    schema.sql           # 20行（slack_metadataのみ）

合計: 約600行
```

**削減率: 約45%減**

---

## パフォーマンスの比較

### Before（独自実装）
- DB書き込み: 承認ごとに3テーブルへINSERT/UPDATE
- 状態確認: ポーリング or webhook
- トランザクション: 手動管理が必要

### After（Mastraネイティブ）
- DB書き込み: Mastraが自動最適化
- 状態確認: `suspend()`/`resume()` で即座に反映
- トランザクション: Mastra内部で保証

**改善点**:
- ✅ レイテンシ削減（ポーリング不要）
- ✅ トランザクション整合性が保証される
- ✅ DB負荷削減（書き込み回数減）

---

## 保守性の比較

### Before（独自実装）
- ❌ スキーマ変更時にマイグレーション必要
- ❌ ステート管理ロジックのバグリスク
- ❌ トレーシング/ログの手動実装

### After（Mastraネイティブ）
- ✅ スキーマはMastraが自動管理
- ✅ ステート管理はMastraが保証
- ✅ Observability自動統合

---

## マイグレーション手順

### ステップ1: Mastraセットアップ
```bash
npm install @mastra/core @mastra/libsql
```

### ステップ2: workflow定義を作成
```typescript
// src/mastra/workflows/researchWorkflow.ts
// （revised-mastra-design.md 参照）
```

### ステップ3: Slack統合
```typescript
// src/slack/app.ts
// （revised-mastra-design.md 参照）
```

### ステップ4: 補助テーブル作成
```sql
CREATE TABLE slack_metadata (...);
```

### ステップ5: 期限チェックジョブ追加
```typescript
import cron from 'node-cron';
// （revised-mastra-design.md 参照）
```

---

## よくある質問（FAQ）

### Q1: 既存のapprovalsテーブルのデータはどうなる？
**A**: 新規プロジェクトなのでマイグレーション不要です。既存システムから移行する場合は、`workflow_snapshots` に変換するスクリプトを作成することを推奨します。

### Q2: Mastraのworkflow_snapshotsテーブルは直接アクセスできる？
**A**: はい、`mastra.getStorage()` 経由でアクセス可能です。ただし、基本的には `workflow.getRunAsync(runId)` などのAPIを使用することを推奨します。

### Q3: 期限管理をMastraのworkflow内で完結できない？
**A**: Mastraには `sleepUntil()` がありますが、24時間のような長時間待機は推奨されません。定期ジョブでのチェックが現実的です。

### Q4: Slack以外（例: Discord, Teams）に拡張できる？
**A**: はい。Mastra workflowはプラットフォーム非依存なので、`slack_metadata` を `chat_metadata` に置き換え、Slack Boltの部分を他のSDKに差し替えるだけで対応可能です。

### Q5: 独自実装との共存は可能？
**A**: はい。段階的に移行することも可能です。例えば、まずworkflow部分だけMastraに移行し、Slack統合は後から追加するなど。

---

## まとめ

| 項目 | Before | After | 改善度 |
|------|--------|-------|--------|
| コード量 | ~1,100行 | ~600行 | ⭐⭐⭐⭐⭐ |
| DB設計 | 3テーブル | 1テーブル | ⭐⭐⭐⭐⭐ |
| 保守性 | 手動管理 | 自動管理 | ⭐⭐⭐⭐⭐ |
| スケーラビリティ | 制限あり | Mastraに準拠 | ⭐⭐⭐⭐ |
| Observability | 手動実装 | 自動統合 | ⭐⭐⭐⭐⭐ |

**結論**: Mastraネイティブ機能を活用することで、実装コストを約半分に削減しながら、より堅牢で保守性の高いシステムを構築できます。
