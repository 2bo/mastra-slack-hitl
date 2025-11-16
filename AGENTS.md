# AGENT仕様書（Codexリファレンス）

Mastra × Slack HITL Deep Research MVP におけるエージェントの仕様を、Codex が迷わず参照できる形でまとめたドキュメントです。`docs/designe/initial.md`（全体設計）や `docs/implementation-tasks.md`（タスク分解）の中で分散している情報を一本化し、`src/mastra/agents/*.ts`／関連ツールを実装・保守する際のブリーフとして利用してください。

---

## 0. 基本運用ルール
1. Codexとのやり取りは必ず日本語。
2. ファイル編集後、コミット前に `pnpm run format && pnpm run lint && pnpm run typecheck` を実行してからレビュー/コミットへ進む。
3. 仕様の疑問があれば、このファイル → `docs/designe/initial.md` → `docs/implementation-tasks.md` の順で確認し、それでも不明な点のみユーザーに確認。

---

## 1. クイックリファレンス

| ID | 担当フェーズ | 主要責務 | 主ファイル | 関連タスク |
| --- | --- | --- | --- | --- |
| `research-agent` | `plan → hitlPlan → gather` | 調査方針生成、HITL承認前後の進捗ストリーム、Web検索 + 評価による情報収集 | `src/mastra/agents/research-agent.ts` | Task 2-2, 2-4, 2-5〜2-7 |
| `report-agent` | `synthesize → deliver` | `researchData` をMarkdownレポート化し Slack へ配信 | `src/mastra/agents/report-agent.ts` | Task 2-3, 2-8, 2-10 |

---

## 2. Codex実装チェックリスト
1. 変更対象と依存タスクを `docs/implementation-tasks.md` で再確認。
2. 該当エージェントの I/O・モデル設定・ツール要件を本書で確認。
3. ステップ／ツール実装や Slack writer との接続を `src/mastra/**/*` 内で整備。
4. `pnpm run format`, `pnpm run lint`, `pnpm run typecheck` を実行。
5. 進捗共有や質問は必ず日本語で行う。

---

## 3. Research Agent

### 3.1 役割概説
- `/research` の入力をもとに詳細な調査方針（Plan）を生成し、Slack に段階的にストリーミング。
- HITL承認が降りるまでは gather をブロックし、承認後にのみ Web検索 + 評価ツールを用いた本調査を実施。
- 調査中は進捗を `gather-progress` イベントで通知し、完了時に `researchData` を返す。

### 3.2 モデル & ツール設定

| 項目 | 値 / 推奨設定 |
| --- | --- |
| Provider / Model | `OPEN_AI` / `gpt-4o` |
| toolChoice | `auto` |
| Plan生成 | `temperature 0.2`, `maxTokens 2000` |
| Gather | `temperature 0.4`, `maxSteps 10`, `tools: ['tavily.search', 'evaluate-result']` |

**ツール定義**

| Tool ID | 目的 | 入力 | 出力 | 実装 |
| --- | --- | --- | --- | --- |
| `tavily.search` | Tavily MCPサーバー経由で関連ソース取得 | `{ query: string, numResults?: number }` | `results: { title, url, snippet }[]` | MCPサーバー `tavily-mcp` |
| `evaluate-result` | 取得情報の信頼度/関連度評価 | `{ finding, sourceUrl, query, criteria? }` | `{ verdict, confidence, rationale }` | `src/mastra/tools/evaluate-result-tool.ts` |

※ `TAVILY_API_KEY` が必須。ツールのエラーは `writer?.write({ type: 'plan-error' | 'gather-progress' })` 等で可視化。

### 3.3 インターフェース

| ワークフローステップ | 入力 | 出力 | Slackイベント |
| --- | --- | --- | --- |
| `plan-step` | `{ query, channelId, userId }` | `{ plan }` | `plan-chunk`, `plan-complete`, `plan-error` |
| `approval-step`（HITL） | `{ plan }` → `suspend` | resume時 `{ approved, approver, reason? }` | Slack UI（承認/差戻しボタン） |
| `gather-step` | `{ plan, approved: true }` | `{ researchData }` | `gather-progress`, `gather-complete` |

### 3.4 プロンプト & ストリーミング指針
- **Plan**: 初期設計 (`docs/designe/initial.md`) 記載のアウトライン（目的／範囲／仮説／観点／主要ソース候補／除外基準／タイムボックス／成果物構成）を Markdown 見出しで生成。`writer` へチャンク毎に流す。
- **Gather**: Plan全文を引用し、一次情報優先・重複排除・URL必須・不確実性記述を明示。長時間推論でも 5 秒以上無出力を避けるため「still working」メッセージを送る。

### 3.5 HITLとデータ管理
- `plan-step` 完了時に `artifacts(kind='plan')` へ保存、Slack message_ts と `request_id` を紐付け。
- `suspend()` payload には `plan`, `requestedAt`, `resumeKey` を含め、再開時に `resume({ approved, approver, reason })`。
- 承認拒否（`approved: false`）の場合は gather/報告フェーズをスキップし、差し戻しメッセージを Slack スレッドへ返して正常終了扱いにする。

### 3.6 品質ガードレール
- 低品質/古いソースは除外理由を明記、同一URLの再取得は禁止（`researchData.sources`で管理）。
- 参照ごとに `source.url`, `source.title`, `retrievedAt` を保持して `report-agent` へ渡す。
- Slack進捗: `plan`/`gather` どちらも段落単位で送信し、例外時は `plan-error` or `gather-progress` で通知。

---

## 4. Report Agent

### 4.1 役割概説
- `generate-report-step` 内で `researchData` をもとに最終レポートを生成し、`deliverWorkflow` → Slack投稿に直結。
- 生成物は Slack Markdown（見出し・箇条書き・リンク）準拠。長文化する箇所はリスト化。

### 4.2 モデル設定

| 項目 | 値 / 推奨設定 |
| --- | --- |
| Provider / Model | `OPEN_AI` / `gpt-4o` |
| temperature | `0.25` |
| maxTokens | `2500` |
| ツール | 既定なし（必要に応じて拡張予定） |

### 4.3 インターフェース
- 入力: `{ researchData: any }`
- 出力: `{ report: string }`
- Slack連携: `writer?.write({ type: 'report-ready', text: report })` → Bolt handler が `chat.postMessage` / `chat.stopStream`。

### 4.4 出力テンプレ（必須セクション）
```
## Executive Summary
- key finding / action

## Detailed Analysis
### Theme A
- insight + evidence + [Title](URL)

## Recommendations
1. Action（Impact/Confidence）

## References
- [Source Title](URL)
```
- Plan仮説との差異、未解決リスク、不確実性は `Detailed Analysis` 末尾に小節を追加。
- 参照URLは `[Title](URL)` 形式で必ず列挙し、引用データに出典を併記。

### 4.5 品質ガードレール
- 5段落以上の連続テキストは禁止。構造化を徹底。
- 機密情報は禁止：プロンプトで「公開情報のみ」と明記。
- Slack投稿が長すぎる場合はセクション毎に区切り、`events` ログへ断面を残す。

---

## 5. エージェント間ハンドオフ
1. `plan-step`: research-agent が Plan を生成 → Slack streaming → `artifacts(kind='plan')`
2. `approval-step`: Slackボタンで HITL → `resume()` → Workflow state更新
3. `gather-step`: 承認済みPlanで research-agent が `tavily.search` + `evaluate-result` を駆動 → `researchData`
4. `generate-report-step`: report-agent が `researchData` を Markdown レポート化
5. `deliverWorkflow`: Slackへ最終投稿、`artifacts(kind='report')` 保存、`events` に `deliver-posted`

---

## 6. 実装タスクとの対応
- **Task 2-2 / 2-3**: エージェント本体（本書セクション3/4の仕様をそのままコードへ）。
- **Task 2-4**: `tavily.search` (MCP) & `evaluate-result` ツール連携（セクション3.2参照）。
- **Task 2-5〜2-8**: Plan / Approval / Gather / Report 各ステップでエージェントを呼び出し、`writer` イベントをSlackへ送る。
- **Task 3-2 / 3-3**: Slack側ハンドラが `plan-chunk` や `gather-progress` をストリーム表示。

---

## 7. 今後の拡張メモ
- 追加エージェント（例: `validation-agent`, `sourcing-agent`）を導入する際は本テンプレに倣ってセクションを増設。
- マルチモデル構成（Plan: GPT、Report: Claude等）に備え、`model.provider` / `model.name` を切り替え可能な設計にする。
- RAG導入時は `evaluate-result` を Embedding 類似度評価と統合し、`researchData` を構造化オブジェクトへ移行。

---

このドキュメントを起点に、Codexはエージェント関連の変更方針・テスト観点・Slack連携仕様を即座に把握できます。不明点があれば更新していき、常に最新の“単一情報源”となるよう保守してください。
