# LangWatch統合 実装計画書（最小限版）

## 概要

LangWatchを使って、Slack HITL調査ワークフローの**基本的なトレーシングと評価**を実装します。

**実装方針**：
- ✅ compose.yml追加でLangWatch起動
- ✅ 基本トレーシング（主要ポイント3箇所のみ）
- ✅ レポート品質の自動評価
- ❌ DBスキーマ変更なし
- ❌ suspend/resumeのスパン継続なし
- ❌ 既存コードの大幅な変更なし

**トレーシング対象**：
1. Slackコマンド受信〜完了（research-handler.ts）
2. ワークフロー全体（main-workflow.ts）
3. レポート生成 + 評価（generate-report-step.ts）

**所要時間**: 約1時間

---

## 1. Docker Compose設定

### compose.yml

プロジェクトルートに作成：

```yaml
# compose.yml
services:
  langwatch:
    image: langwatch/langwatch:latest
    ports:
      - "5560:5560"
    environment:
      NODE_ENV: development
      BASE_HOST: http://localhost:5560
      NEXTAUTH_URL: http://localhost:5560
      NEXTAUTH_PROVIDER: email
      NEXTAUTH_SECRET: local-dev-secret
      API_TOKEN_JWT_SECRET: local-jwt-secret
      DATABASE_URL: postgresql://prisma:prisma@postgres:5432/mydb?schema=mydb
      ELASTICSEARCH_NODE_URL: http://opensearch:9200
      IS_OPENSEARCH: "true"
      REDIS_URL: redis://redis:6379
      LANGWATCH_NLP_SERVICE: http://langwatch_nlp:5561
      LANGEVALS_ENDPOINT: http://langevals:5562
      DISABLE_PII_REDACTION: "false"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - langwatch

  langwatch_nlp:
    image: langwatch/langwatch_nlp:latest
    ports:
      - "5561:5561"
    networks:
      - langwatch

  langevals:
    image: langwatch/langevals:latest
    ports:
      - "5562:5562"
    networks:
      - langwatch

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: prisma
      POSTGRES_PASSWORD: prisma
      POSTGRES_DB: mydb
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prisma"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - langwatch

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - langwatch

  opensearch:
    image: langwatch/opensearch-lite:latest
    ports:
      - "9200:9200"
    environment:
      discovery.type: single-node
      OPENSEARCH_JAVA_OPTS: "-Xms128m -Xmx256m"
      DISABLE_SECURITY_PLUGIN: "true"
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    networks:
      - langwatch

networks:
  langwatch:
    driver: bridge

volumes:
  postgres-data:
  opensearch-data:
```

### 起動方法

```bash
# LangWatch起動
docker compose up -d --wait

# ダッシュボードアクセス
open http://localhost:5560

# 停止
docker compose down

# 完全削除（データ含む）
docker compose down -v
```

---

## 2. 環境変数設定

`.env`に追加：

```bash
# LangWatch
LANGWATCH_API_KEY=sk-lw-xxx  # http://localhost:5560 でサインアップ後に取得
LANGWATCH_ENDPOINT=http://localhost:5560
LANGWATCH_ENABLED=true
```

---

## 3. 基本トレーシングの実装

### 3.1 パッケージインストール

```bash
pnpm add langwatch
```

### 3.2 ディレクトリ構成

```
src/
├── observability/          # 新規作成
│   ├── setup.ts           # LangWatch初期化
│   ├── tracers.ts         # シンプルなトレーサー
│   └── evaluators.ts      # 評価機能
└── (既存ファイル)
```

### 3.3 src/observability/setup.ts

```typescript
import logger from '../utils/logger.js';

export async function setupLangWatch(): Promise<void> {
  const apiKey = process.env.LANGWATCH_API_KEY;
  const enabled = process.env.LANGWATCH_ENABLED === 'true';

  if (!enabled || !apiKey) {
    logger.info('LangWatch is disabled');
    return;
  }

  try {
    const { setupObservability } = await import('langwatch/observability/node');
    await setupObservability({
      apiKey,
      endpoint: process.env.LANGWATCH_ENDPOINT || 'http://localhost:5560',
      serviceName: 'mastra-slack-hitl',
      environment: process.env.NODE_ENV || 'development',
    });
    logger.info('LangWatch initialized');
  } catch (error) {
    logger.error('LangWatch initialization failed:', error);
  }
}
```

### 3.4 src/observability/tracers.ts

```typescript
import { getLangWatchTracer } from 'langwatch';

const tracer = getLangWatchTracer('mastra-slack-hitl');

export async function traceWorkflow<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  if (!tracer) return await fn();

  return await tracer.withActiveSpan(name, async (span) => {
    span.setType('workflow');
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        span.setAttribute(key, String(value));
      });
    }

    try {
      const result = await fn();
      span.setStatus({ code: 0 }); // OK
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: (error as Error).message });
      span.setAttribute('error', true);
      throw error;
    }
  });
}
```

### 3.5 src/index.ts修正

```typescript
import { setupLangWatch } from './observability/setup.js';
// ... 既存のインポート

async function main() {
  // LangWatch初期化（最初に実行）
  await setupLangWatch();

  // ... 既存の起動処理
}

main();
```

### 3.6 src/slack/handlers/research-handler.ts修正

```typescript
import { traceWorkflow } from '../../observability/tracers.js';
// ... 既存のインポート

export const handleResearchCommand = async ({
  command,
  ack,
  client,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => {
  await ack();

  return await traceWorkflow(
    'slack-research-command',
    async () => {
      // ... 既存の処理（そのまま）
    },
    {
      'slack.user_id': command.user_id,
      'slack.channel_id': command.channel_id,
      'input.query': command.text.trim(),
    }
  );
};
```

### 3.7 src/mastra/workflows/main-workflow.ts修正

```typescript
import { traceWorkflow } from '../../observability/tracers.js';
// ... 既存のインポート

export const mainWorkflow = createWorkflow({
  id: 'main-workflow',
  // ... 既存の設定

  execute: async (context, writer) => {
    return await traceWorkflow(
      'main-workflow',
      async () => {
        // ... 既存の処理（そのまま）
      },
      {
        'workflow.run_id': context.runId,
        'workflow.query': context.query,
      }
    );
  },
});
```

---

## 4. 評価機能の実装

### 4.1 src/observability/evaluators.ts

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface EvaluationResult {
  score: number;  // 0.0 ~ 1.0
  reason: string;
  passed: boolean;
}

/**
 * レポート品質を評価（完全性・関連性・読みやすさ）
 */
export async function evaluateReport(
  query: string,
  report: string
): Promise<EvaluationResult> {
  const model = process.env.LANGWATCH_EVALUATION_MODEL || 'gpt-4o-mini';

  const prompt = `
あなたは調査レポートの品質評価者です。

## 元のクエリ
${query}

## 生成されたレポート
${report}

## 評価基準
1. 完全性: クエリに対する回答として十分か？
2. 関連性: クエリに関連した内容か？
3. 読みやすさ: 論理的で理解しやすいか？

## 出力形式（JSON）
{
  "score": 0.0 ~ 1.0 の数値,
  "reason": "評価理由（日本語で簡潔に）",
  "passed": true/false（0.7以上でtrue）
}
`;

  try {
    const result = await generateText({
      model: openai(model),
      prompt,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result.text);
    return {
      score: parsed.score,
      reason: parsed.reason,
      passed: parsed.score >= 0.7,
    };
  } catch (error) {
    console.error('Evaluation failed:', error);
    return {
      score: 0,
      reason: '評価エラー',
      passed: false,
    };
  }
}
```

### 4.2 src/mastra/workflows/steps/generate-report-step.ts修正

```typescript
import { evaluateReport } from '../../../observability/evaluators.js';
// ... 既存のインポート

export const generateReportStep = createStep({
  id: 'generate-report-step',
  // ... 既存の設定

  execute: async (context, writer) => {
    // ... 既存のレポート生成処理

    const report = /* レポート生成結果 */;

    // 評価実行
    if (process.env.LANGWATCH_ENABLED === 'true') {
      const evaluation = await evaluateReport(context.query, report);

      // ログ出力
      console.log('Report Evaluation:', {
        score: evaluation.score,
        reason: evaluation.reason,
        passed: evaluation.passed,
      });

      // Slackに評価結果を追加（オプション）
      // await writer?.write({
      //   type: 'evaluation-result',
      //   score: evaluation.score,
      //   reason: evaluation.reason,
      // });
    }

    return { report };
  },
});
```

---

## 5. 実装手順

### ステップ1: Docker Compose起動（15分）

```bash
# compose.yml作成（上記の内容をコピー）
vi compose.yml

# LangWatch起動
docker compose up -d --wait

# ダッシュボードでサインアップ
open http://localhost:5560
# メールアドレスとパスワードでアカウント作成
# Settings → API Keys → Create API Key
# 生成されたキー（sk-lw-...）をコピー
```

### ステップ2: 環境変数設定（5分）

```bash
# .envに追加
echo 'LANGWATCH_API_KEY=sk-lw-...' >> .env
echo 'LANGWATCH_ENDPOINT=http://localhost:5560' >> .env
echo 'LANGWATCH_ENABLED=true' >> .env
```

### ステップ3: パッケージインストール（2分）

```bash
pnpm add langwatch
```

### ステップ4: observabilityディレクトリ作成（20分）

```bash
# ディレクトリとファイル作成
mkdir -p src/observability
touch src/observability/setup.ts
touch src/observability/tracers.ts
touch src/observability/evaluators.ts

# 上記のコードをコピー＆ペースト
```

### ステップ5: 既存ファイルの修正（15分）

```bash
# 以下の3ファイルを修正
# - src/index.ts
# - src/slack/handlers/research-handler.ts
# - src/mastra/workflows/main-workflow.ts
# 上記のコード例を参照
```

### ステップ6: 評価機能の追加（10分）

```bash
# generate-report-step.ts を修正
# 上記のコード例を参照
```

### ステップ7: テスト（10分）

```bash
# アプリ起動
pnpm run dev:slack

# Slackで /research AIの最新トレンド を実行

# LangWatchダッシュボードでトレース確認
open http://localhost:5560

# 評価結果をログで確認
# Report Evaluation: { score: 0.85, reason: '...', passed: true }
```

---

## 6. 運用ガイド

### ダッシュボードの使い方

- **Traces**: 全ワークフロー実行の一覧
- **Trace Details**: 個々のトレースの詳細（スパンツリー、タイムライン）
- **検索**: `status = "error"` でエラーのみ表示

### トラブルシューティング

#### LangWatch起動エラー

```bash
# ポート競合の場合
docker compose down
docker compose up -d --wait

# メモリ不足の場合
# Docker Desktop設定でメモリを2GB以上に増やす
```

#### トレース送信失敗

```bash
# LangWatch起動確認
docker compose ps

# API Key確認
echo $LANGWATCH_API_KEY

# 疎通確認
curl http://localhost:5560/api/health
```

#### 評価が実行されない

```bash
# 環境変数確認
echo $LANGWATCH_ENABLED  # true であることを確認

# ログ確認
# "Report Evaluation:" というログが出力されているか確認
```

---

## まとめ

**実装内容**：
- compose.yml: LangWatch起動環境
- observability/: トレーシング＆評価の基盤
- 最小限の変更: 3ファイルのみ修正

**得られる価値**：
- ワークフロー全体の可視化
- レポート品質の自動評価
- パフォーマンス分析

**次のステップ**：
- 他のステップ（planStep、gatherStep）にもトレーシング追加（オプション）
- カスタム評価基準の追加
- 本番環境へのデプロイ

---

**Document Version**: 2.0 (Simplified)
**Last Updated**: 2025-11-17
