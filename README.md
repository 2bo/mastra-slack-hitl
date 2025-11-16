# Mastra Slack HITL Deep Research

Slackから実行できるAI調査ワークフローシステムです。AIが生成した調査計画を人間が承認した後、深い調査を実行し、進捗とレポートをリアルタイムでSlackにストリーミング配信します。

## 🎯 概要

このプロジェクトは、**Human-In-The-Loop (HITL)** 承認フローを備えた深層調査システムです。

### 主な機能

- 📝 **AI調査計画の自動生成**: ユーザーのクエリから詳細な調査計画を自動生成
- 👤 **人間による承認フロー**: 調査実行前に計画を承認/差戻し
- 🔍 **Tavily MCP統合**: Web検索による包括的な情報収集
- 📊 **レポート自動生成**: 収集したデータから構造化レポートを作成
- 🌊 **リアルタイムストリーミング**: Slack Chat Streaming APIで進捗を配信
- ⏰ **期限管理**: 承認待ちの自動タイムアウト処理
- 👍👎 **フィードバック収集**: 調査結果に対するユーザーフィードバックをデータベースに保存

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                         Slack App                           │
│  /research コマンド → ストリーミング → 承認ボタン           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mastra Workflow                          │
│  plan → approval (HITL) → gather → generate-report          │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌────────┐    ┌──────────┐    ┌──────────┐
    │Research│    │  Report  │    │  Tavily  │
    │ Agent  │    │  Agent   │    │   MCP    │
    └────────┘    └──────────┘    └──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  SQLite/LibSQL      │
              │  (Drizzle ORM)      │
              └─────────────────────┘
```

### コンポーネント

- **Slack**: `/research` スラッシュコマンド + ストリーミング更新 + 承認ボタン
- **Mastra**: ワークフローパイプライン（`plan → HITL承認 → gather → deliver`）
- **Storage**: 開発時はSQLite (`./data/mastra.db`)、本番ではPostgreSQLに切り替え可能
- **Background Jobs**: cron形式の期限チェッカー（承認待ちの自動タイムアウト）

## 📁 プロジェクト構造

```
mastra-slack-hitl/
├── src/
│   ├── mastra/                # Mastraワークフロー & エージェント
│   │   ├── agents/
│   │   │   ├── research-agent.ts    # 調査エージェント（GPT-4o + Tavily）
│   │   │   └── report-agent.ts      # レポート生成エージェント
│   │   ├── tools/
│   │   │   └── evaluate-result-tool.ts
│   │   ├── workflows/
│   │   │   ├── steps/
│   │   │   │   ├── plan-step.ts           # 調査計画生成
│   │   │   │   ├── approval-step.ts       # HITL承認ゲート
│   │   │   │   ├── gather-step.ts         # 情報収集
│   │   │   │   └── generate-report-step.ts # レポート生成
│   │   │   ├── research-workflow.ts
│   │   │   ├── deliver-workflow.ts
│   │   │   └── main-workflow.ts
│   │   └── index.ts
│   ├── slack/                 # Slack統合
│   │   ├── handlers/
│   │   │   ├── command-handler.ts   # /research コマンド
│   │   │   ├── action-handler.ts    # 承認/差戻し/フィードバックボタン
│   │   │   └── streaming-handler.ts # ワークフローストリーミング
│   │   ├── blocks/
│   │   │   ├── approval-blocks.ts
│   │   │   └── feedback-blocks.ts   # フィードバックボタンUI
│   │   ├── utils/
│   │   │   └── chat-stream.ts
│   │   └── bolt-app.ts
│   ├── db/                    # データベース層
│   │   ├── schema.ts              # Drizzle ORMスキーマ
│   │   ├── client.ts
│   │   ├── connection.ts
│   │   └── repositories/
│   │       ├── slack-metadata-repository.ts
│   │       ├── research-runs-repository.ts
│   │       └── feedbacks-repository.ts
│   ├── mcp/                   # MCP統合
│   │   └── tavily-client.ts
│   ├── jobs/                  # 背景ジョブ
│   │   └── deadline-checker.ts
│   ├── logger.ts
│   └── index.ts               # メインエントリーポイント
├── drizzle/                   # DBマイグレーション
├── docs/                      # 設計ドキュメント
│   ├── designe/
│   │   └── revised-mastra-design.md
│   └── implementation-tasks.md
├── .env.development.example
├── .env.production.example
├── package.json
├── tsconfig.json
└── README.md
```

詳細な実装ロードマップは `docs/implementation-tasks.md` を参照してください。

## 🚀 セットアップ

### 前提条件

- Node.js 18以上
- pnpm（推奨）または npm
- Slackワークスペース（管理者権限）
- OpenAI APIキー
- Tavily APIキー

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd mastra-slack-hitl
```

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. 環境変数の設定

開発環境用の設定ファイルをコピー:

```bash
cp .env.development.example .env
```

`.env` ファイルを編集して、以下の値を設定:

```bash
# Slack設定（開発: Socket Mode）
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-1-xxxxx-xxxxx-xxxxx    # Slack App Tokenを設定
SLACK_BOT_TOKEN=xoxb-xxxxx-xxxxx-xxxxx      # Bot User OAuth Tokenを設定
SLACK_SIGNING_SECRET=xxxxxxxxxxxxx          # Signing Secretを設定

# Database（開発: SQLite/LibSQL）
DATABASE_URL=file:./data/mastra.db

# LLM API
OPENAI_API_KEY=sk-xxxxxxxxxxxxx             # OpenAI APIキーを設定

# Tavily MCP
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx           # Tavily APIキーを設定

# Logging
LOG_LEVEL=debug
```

#### Slack Appの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. "Create New App" → "From scratch" を選択
3. App名とワークスペースを選択
4. 以下の設定を行う:

**OAuth & Permissions**:
- Bot Token Scopes:
  - `chat:write`
  - `commands`
  - `channels:read`
  - `users:read`

**Socket Mode** (開発時):
- Socket Modeを有効化
- App-Level Tokenを生成 (`connections:write` スコープ)

**Slash Commands**:
- Command: `/research`
- Request URL: (Socket Modeの場合は不要)

**Interactivity & Shortcuts**:
- Interactivityを有効化
- Request URL: (Socket Modeの場合は不要)

5. アプリをワークスペースにインストール

### 4. データベースのマイグレーション

```bash
pnpm run db:migrate
```

### 5. コードの検証

```bash
# 型チェック
pnpm run typecheck

# Lint
pnpm run lint

# フォーマットチェック
pnpm run format:check
```

## 💻 開発

### 開発サーバーの起動

#### Mastra Studioの起動（推奨）

Mastraのプレイグラウンド + RESTサーバーを起動:

```bash
pnpm run dev:mastra
```

http://localhost:4111/ でMastra Studioにアクセスできます。
Slack連携前にエージェントやワークフローをテストできます。

#### Slack Appのみ起動

```bash
pnpm run dev:slack
```

### 本番ビルド

```bash
# ビルド
pnpm run build

# 本番起動
pnpm run start
```

## 📖 使い方

### 基本的な使い方

1. Slackで `/research <調査テーマ>` を実行

```
/research AI技術トレンド2025
```

2. AIが調査計画を生成（リアルタイムでストリーミング表示）

3. 承認ボタンが表示される
   - ✅ **承認して本調査を開始**: 調査を続行
   - ❌ **差し戻し**: 調査を中止

4. 承認後、情報収集が開始される（進捗をストリーミング表示）

5. 最終レポートが生成される

6. フィードバックボタンが表示される
   - 👍 **ポジティブ**: 調査結果が役に立った
   - 👎 **ネガティブ**: 調査結果が期待に沿わなかった

### ワークフローの流れ

```
1. plan-step          → 調査計画を生成（ストリーミング）
2. approval-step      → 人間の承認を待機（suspend）
3. gather-step        → Tavily検索で情報収集
4. generate-report    → レポート生成（ストリーミング）
```

### 期限管理

- 承認待ちの状態で**24時間**経過すると自動的にタイムアウト
- 15分毎にバックグラウンドジョブが期限切れをチェック
- タイムアウト時は自動的に調査がキャンセルされ、Slackに通知

## 🛠️ トラブルシューティング

### よくある問題

#### 1. `mastra` コマンドが見つからない

```bash
pnpm add -D mastra
```

または

```bash
pnpm dlx mastra dev
```

#### 2. Slack接続エラー

- Socket Modeが有効になっているか確認
- `SLACK_APP_TOKEN` が正しく設定されているか確認
- Bot TokenとApp Tokenを混同していないか確認

#### 3. データベースエラー

```bash
# マイグレーションを再実行
pnpm run db:migrate

# データベースファイルを削除して再作成
rm -rf data/mastra.db
pnpm run db:migrate
```

#### 4. Tavily検索が動作しない

- `TAVILY_API_KEY` が正しく設定されているか確認
- Tavily APIの制限に達していないか確認

## 📊 データベーススキーマ

このアプリは3つのテーブルで構成されています。すべて `slack_*` プレフィックスを使用し、Mastraのテーブル（`mastra_*`）と分離されています。

### slack_metadata テーブル

Slack連携のメタデータを管理（メッセージタイムスタンプ、承認期限など）

| カラム | 型 | 説明 |
|--------|-----|------|
| runId | TEXT (PK) | ワークフローのRun ID |
| channelId | TEXT | SlackチャンネルID |
| messageTs | TEXT | 最初のメッセージのタイムスタンプ |
| threadTs | TEXT | ストリーミングメッセージのタイムスタンプ |
| approvalMessageTs | TEXT | 承認メッセージのタイムスタンプ |
| requester | TEXT | リクエストしたユーザーID |
| deadlineAt | INTEGER | 承認期限（Unix timestamp） |
| createdAt | INTEGER | 作成日時（Unix timestamp） |
| updatedAt | INTEGER | 更新日時（Unix timestamp） |

**インデックス:**
- `idx_slack_metadata_deadline`: deadlineAtカラム（期限チェック用）
- `idx_slack_metadata_channel`: channelIdカラム

### slack_research_runs テーブル

調査実行の内容を管理（クエリ、計画、レポート）

| カラム | 型 | 説明 |
|--------|-----|------|
| runId | TEXT (PK, FK) | ワークフローのRun ID（slack_metadataへの外部キー） |
| query | TEXT | ユーザーが入力した調査クエリ |
| plan | TEXT | AIが生成した調査計画 |
| report | TEXT | 最終調査レポート |
| createdAt | INTEGER | 作成日時（Unix timestamp） |
| updatedAt | INTEGER | 更新日時（Unix timestamp） |

### slack_feedbacks テーブル

調査結果に対するユーザーフィードバックを管理

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER (PK) | オートインクリメントID |
| runId | TEXT (FK) | ワークフローのRun ID（slack_research_runsへの外部キー） |
| feedbackType | TEXT | フィードバック種別（'positive' または 'negative'） |
| userId | TEXT | フィードバックしたユーザーID |
| messageTs | TEXT | フィードバックボタンがあるメッセージのタイムスタンプ |
| createdAt | INTEGER | 作成日時（Unix timestamp） |

**インデックス:**
- `idx_slack_feedbacks_run_id`: runIdカラム
- `idx_slack_feedbacks_created_at`: createdAtカラム

## 🔧 開発用スクリプト

| スクリプト | 説明 |
|-----------|------|
| `pnpm run dev:mastra` | Mastra Studioを起動 |
| `pnpm run dev:slack` | Slack Appのみを起動 |
| `pnpm run build` | TypeScriptをビルド |
| `pnpm run start` | ビルド済みアプリを起動 |
| `pnpm run typecheck` | 型チェック |
| `pnpm run lint` | ESLintでコードチェック |
| `pnpm run lint:fix` | ESLintで自動修正 |
| `pnpm run format` | Prettierでフォーマット |
| `pnpm run format:check` | フォーマットチェック |
| `pnpm run db:generate` | Drizzleマイグレーションを生成 |
| `pnpm run db:migrate` | マイグレーションを適用 |

## 🌐 本番環境での実行

本番環境では**Events API**を使用します（Socket Modeの代わり）:

```bash
# .env.production
SLACK_SOCKET_MODE=false
SLACK_BOT_TOKEN=xoxb-xxxxx
SLACK_SIGNING_SECRET=xxxxx
PORT=3000

DATABASE_URL=file:/var/lib/mastra/mastra.db
OPENAI_API_KEY=sk-xxxxx
TAVILY_API_KEY=tvly-xxxxx
LOG_LEVEL=info
```

Slack Appの設定で以下を追加:
- **Request URL**: `https://your-domain.com/slack/events`
- **Slash Commands Request URL**: `https://your-domain.com/slack/commands`
- **Interactivity Request URL**: `https://your-domain.com/slack/interactive`

## 📚 参考資料

- [Mastra Documentation](https://mastra.ai/docs)
- [Mastra Deep Research Template](https://github.com/mastra-ai/template-deep-research)
- [Mastra Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js)
- [Slack Chat Streaming API](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)
- [Drizzle ORM](https://orm.drizzle.team/)

## 📝 ライセンス

MIT

---

**Built with** [Mastra](https://mastra.ai) 🚀
