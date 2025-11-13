# Mastra × Slack（Socket Mode）× Deep Research（HITL承認）

## 仕様書・基本設計（MVP｜SQLite版・ノンコード）

---

## 0. 目的（Purpose）

MastraとSlackでHuman-in-the-Loop（HITL）型のDeep Researchワークフローを実現し、調査方針の人間承認を組み込んだMVPを構築する。

* Slack から Deep Research を起動し、**本調査に入る前に AI が作る「調査方針（Plan）」を人が承認（HITL）**してからのみ調査を実行する。
* 生成中・調査中は **Slack のチャット・ストリーミング**で段階的に進捗を見せ、**最終レポートを同じチャンネルに配信**する。
* ローカル PC（Socket Mode）で動く **最小 MVP** を確立し、後日クラウド/本番へ移行しやすい設計にする。

---

## 1. スコープ / 非スコープ

**スコープ（MVP）**

* Slack App は **Socket Mode**（公開 URL 不要）
* Mastra Deep Research テンプレ：
  `plan → hitlPlan（承認ゲート）→ gather → synthesize → deliver`
* **承認前は検索を走らせない**
* 状態管理は **SQLite（単一ファイル）**
* Slack **チャット・ストリーミング**で方針/進捗を段落単位で提示

**非スコープ（MVP外）**

* 永続キューや Redis、RAG 大規模化、厳格 RBAC、PDF/Slides 出力

---

## 2. ユースケース / ユーザーストーリー

* **UC-1 起票**：依頼者が `/research テーマ 目的 期限` を実行
* **UC-2 方針確認**：レビュアが **方針ドラフト（Markdown）** を読み、**承認 / 差戻し** を選択
* **UC-3 進捗可視化**：関係者が方針生成中・本調査中の **ストリーミング出力** を閲覧
* **UC-4 受領**：依頼者が **最終レポート（Markdown）** を同チャンネルで受け取る

---

## 3. 画面・メッセージ（ノンコード仕様）

**方針ドラフト提示（ストリーミング → 承認 UI）**

* 見出し：**「調査方針（ドラフト）— 承認してください」**
* 本文（項目）：

  * 目的／範囲（対象・地域・期間）／仮説（2–3）／観点（3–6：市場・競合・技術・リスク等）
  * 主要ソース候補（一次情報優先）／除外基準（低品質・旧情報）／タイムボックス／成果物構成
* アクション：**「承認して本調査を開始」**、**「差し戻し」**（MVPでは理由任意）

**本調査の進捗**

* 収集・要約の途中経過を **短い段落で追記**（ストリーム）
* 完了後、確定レポは **静的メッセージ** で別投稿

**最終レポ（Markdown）**

* 要点（章立て）／反証点／判断材料／不確実性／推奨アクション

---

## 4. シーケンス（テキスト図）

```
User → Slack（/research）
Slack → Slack App（Socket）→ Mastra（start）
Mastra（plan）→ Slack App（方針をストリーミング表示）
User（承認 or 差戻し）→ Slack App → Mastra（resume or terminate）

[承認]
Mastra（gather → synthesize）→ Slack App（進捗ストリーミング）
Mastra（deliver 最終レポ）→ Slack App（確定メッセージ投稿）

[差戻し]
Mastra 終了（差戻し通知・ログ）
```

---

## 5. 構成（テキスト図｜ローカル最小）

```
[User] --Slack UI--> [Slack Platform]
                           │(Socket Mode, WebSocket)
                           ▼
                     [Slack App]
                           │（起動/承認受け付け・ストリーム表示）
                           ▼
                    [Mastra Workflow]
        plan → hitlPlan（承認ゲート）→ gather → synthesize → deliver
                           │（必要に応じて外部取得）
                           ▼
                        [Web情報]

[Persistence] SQLite（./data/app.db）
  - approvals / events / artifacts
```

---

## 6. データ設計（概念）

**approvals（承認チケット）**

* `id`, `request_id`（/research 起票の識別子）, `resume_key`, `status`（WAITING/APPROVED/REJECTED/TIMEOUT）
* `requester`, `channel`, `message_ts`, `deadline_at`, `decided_at`, `reason`
* `created_at`, `updated_at`

**events（監査ログ）**

* `id`, `request_id`, `type`（plan_posted/approved/rejected/timeout/deliver_posted/error）
* `actor`, `meta`, `ts`

**artifacts（成果物メタ）**

* `id`, `request_id`, `kind`（plan|report）, `title`, `summary`, `content_ref`（本文 or ローカルパス）, `hash`, `created_at`

**インデックス**

* `approvals.request_id`（一意想定）
* `approvals.status + deadline_at`（期限スイープ）
* `events.request_id`

**保存方針**

* MVP は本文も DB に収めて可。将来はファイル/オブジェクトストレージへ分離し、`content_ref` を差し替え。

---

## 7. 状態遷移（要約）

* `CREATED → WAITING_APPROVAL →`

  * `APPROVED → DELIVERED → DONE`
  * `REJECTED → TERMINATED`
  * `TIMEOUT → TERMINATED`

---

## 8. 期限/TTL（SQLite 運用）

* **承認待ち期限**：デフォルト 24h
* **クリーンアップ**：起動時＋定期（例 15 分毎）に `deadline_at < now AND status=WAITING` を `TIMEOUT` へ更新し `events` 記録
* **冪等**：`resume_key` と `status` の整合で二重承認無視

---

## 9. エラーハンドリング（方針）

* 方針生成失敗：短い失敗通知＋`events`記録
* 承認期限切れ：`TIMEOUT` 化・通知
* ストリーミング失敗：通常メッセージで代替し続行
* 重複クリック：後着は無視（先勝）

---

## 10. 受け入れ基準（Acceptance）

* `/research` 実行で **方針ドラフトがストリーミング表示** される
* **承認が来るまで gather に進まない**
* **差戻しで終了**（`approvals.status=REJECTED`、`events` 記録）
* **承認後に進捗ストリーム → 最終レポ投稿**（`artifacts(kind=report)` 作成）
* 再起動しても **承認待ちが消えない**（SQLite 永続）

---

## 11. 運用・バックアップ（ローカル）

* DB：`./data/app.db`（Git 管理外）
* バックアップ：開発時は手動コピーで十分
* 同時実行：少数前提。書込み時間を短くしロック影響を最小化
* 将来：本文肥大時はファイル分離（`content_ref` をローカルパスへ）

---

## 12. 今後の拡張（移行計画）

* **承認待ち/TTL**：Redis（短命キー）
* **監査/KPI**：Postgres（Supabase）
* **本文保管**：S3/GCS（`content_ref` を URL 化）
* **可観測性**：Langfuse（`plan→hitl→gather→synth→deliver` トレース）
* **疎結合**：Queue（SQS/PubSub）と Worker 分離
* **差戻し理由**：モーダルで必須化

---

## 13. 技術セット（Tech Stack｜SQLite 版 MVP）

**ランタイム & 言語**

* Node.js 18+
* TypeScript（`strict`／`noImplicitAny`）

**Slack**

* Slack App（**Socket Mode**）
* スコープ：`commands`, `chat:write`
* 機能：Slash `/research`、承認/差戻しボタン、**チャット・ストリーミング**（生成中/調査中の段落追記）

**Mastra**

* Deep Research テンプレ
* ステップ：`plan → hitlPlan（承認ゲート）→ gather → synthesize → deliver`
* ポリシー：**承認前は検索実行しない**

**データストア**

* **SQLite**（`./data/app.db`）
* テーブル：`approvals` / `events` / `artifacts`
* 期限処理：承認待ち 24h → TIMEOUT
* 将来移行：Redis（HITL/TTL）＋ Postgres（監査）＋ S3/GCS（本文）

**観測/ログ（MVP）**

* 標準ログ：`request_id`, フェーズ, イベント, タイムスタンプ
* KPI（手動集計可）：承認までの時間／差戻し率／TIMEOUT 件数
* 将来：Langfuse 導入

**セキュリティ**

* Secrets：Slack トークン・検索 API キーは環境変数（ローカルは `.env`）
* 最小権限：`commands` / `chat:write`
* 承認者制御（任意）：チャンネルメンバー or 特定ロール

**テスト & 検証**

* 対話 E2E：`/research` → 方針ストリーム → 承認 → 最終レポ
* 耐障害：再起動後の承認待ち存続、期限切れ遷移、重複クリック無視

**開発環境**

* ローカル常駐（Socket Mode、**ngrok 不要**）
* パッケージ：npm / pnpm
* Lint/Format：ESLint + Prettier
* リポ構成例：`/src (slack|workflow|db|domain)`, `/data (app.db)`, `/docs (本仕様書)`

**抽象化ポイント（将来移行を楽にする）**

* HITL ステート・リポジトリ層（SQLite → Redis/Postgres へ差替可能）
* Artifacts 保存層（DB → ファイル/オブジェクトストレージへ）

---

## 14. 成功基準（KGI/KPIの初期設定）

* **KGI**：調査開始から納品までのリードタイム短縮／方針差戻し率の逓減
* **KPI**：承認までの中央値、差戻し率、TIMEOUT 率、最終レポ提出率、ストリーム更新回数（過多抑制）

---


## 参考

- [New features designed for Slack apps sending AI responses \| Slack Developer Docs](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)