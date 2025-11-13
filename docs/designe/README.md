# 設計ドキュメント一覧

このディレクトリには、Mastra × Slack HITL Deep Research プロジェクトの設計ドキュメントが含まれています。

## ドキュメント構成

### 1. `initial.md` - 初期設計書
最初に作成された設計書。独自実装を中心とした設計。

**特徴**:
- 独自の `approvals`/`events`/`artifacts` テーブル
- 手動のステート管理
- SQLite を想定した設計

**用途**: 初期の設計思想を理解するための参考資料

---

### 2. `revised-mastra-design.md` - 推奨設計書 ⭐
**Mastraの公式機能を最大限活用した改訂版設計書**

**特徴**:
- ✅ Mastra workflow snapshots による自動ステート管理
- ✅ `suspend()`/`resume()` によるHITL実装
- ✅ `streamVNext()` による進捗配信
- ✅ Nested workflows による階層化
- ✅ 補助テーブルは Slack 固有情報のみ
- ✅ 実装コード量を約45%削減

**用途**: **このプロジェクトの正式な設計書として使用** 🎯

**主要セクション**:
- 第14章: 実装の詳細設計（コード例付き）
- 第13章: 技術スタック
- 第6章: データ設計

---

### 3. `migration-guide.md` - マイグレーションガイド
初期設計から改訂版への変更点を詳しく解説

**特徴**:
- Before/After の比較
- 変更理由の説明
- コード量の削減効果
- よくある質問（FAQ）

**用途**: 設計変更の背景を理解するための資料

---

## 推奨される読み方

### 新規参加者向け
1. まず `revised-mastra-design.md` を読む（正式な設計書）
2. 必要に応じて `migration-guide.md` で変更背景を確認

### 初期設計からの変更を理解したい場合
1. `initial.md` で初期設計を確認
2. `migration-guide.md` で変更点を理解
3. `revised-mastra-design.md` で最終設計を確認

---

## クイックリファレンス

### アーキテクチャ概要
```
Slack User
    ↓ /research command
Slack Bolt App (Socket Mode)
    ↓ workflow.start()
Mastra Workflow
    ├─ researchWorkflow (nested)
    │   ├─ planStep (Agent生成 + streaming)
    │   ├─ approvalStep (suspend/resume)
    │   └─ gatherStep (Web検索)
    └─ deliverWorkflow (nested)
        └─ generateReportStep

Persistence
    ├─ workflow_snapshots (Mastra managed)
    └─ slack_metadata (補助テーブル)
```

### 技術スタック
- **Framework**: Mastra (`@mastra/core`)
- **Storage**: LibSQL (dev) / PostgreSQL (prod)
- **Slack**: Bolt SDK (Socket Mode)
- **Language**: TypeScript (strict mode)

### データモデル
- **Workflow状態**: Mastra が自動管理（`workflow_snapshots`）
- **Slack情報**: 補助テーブル（`slack_metadata`）で管理

---

## 次のステップ

### 1. 環境セットアップ
```bash
# 依存関係インストール
npm install @mastra/core @mastra/libsql @slack/bolt

# 環境変数設定
cp .env.example .env
# SLACK_BOT_TOKEN, SLACK_APP_TOKEN, OPENAI_API_KEY を設定
```

### 2. プロトタイプ実装
Mastraの [Deep Researchテンプレート](https://github.com/mastra-ai/template-deep-research) をベースに:
```bash
npx create-mastra@latest --template deep-research
```

### 3. Slack統合追加
`revised-mastra-design.md` 第14.2章を参照

---

## 参考リンク

### Mastra公式
- [Mastra Docs](https://mastra.ai/docs)
- [Workflows Overview](https://mastra.ai/docs/workflows/overview)
- [Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Human-in-the-Loop Example](https://mastra.ai/docs/workflows/human-in-the-loop)
- [Deep Research Template](https://github.com/mastra-ai/template-deep-research)

### Slack公式
- [Bolt for JavaScript](https://slack.dev/bolt-js)
- [Socket Mode](https://api.slack.com/apis/connections/socket)
- [Interactive Components](https://api.slack.com/interactivity)

---

## 質問・フィードバック

設計に関する質問や提案がある場合は、GitHubのIssueまたはSlackチャンネルで議論してください。

---

**最終更新**: 2025年11月
**ステータス**: ✅ レビュー完了・実装準備完了
