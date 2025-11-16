# Slack HITL 承認で再開に失敗する問題

## 症状

Slack の承認ボタンを押すと、バックエンドのログに次のエラーが出て gather が再開しない。

```
This workflow step "approval-step" was not suspended. Available suspended steps: [research-workflow]
```

## 原因

- Mastra の `run.resume()` / `run.resumeStreamVNext()` は、サスペンドされているステップを `workflowId.stepId` 形式で識別する。
- 研究ワークフローは `research-workflow` → `approval-step` というネスト構造のため、ストレージには `research-workflow.approval-step` がサスペンド済みとして保存される。
- しかし Slack のハンドラや期限切れ処理では `approval-step` だけを指定して `resume` していたため一致せず、上記 TypeError が発生していた。

## 対策

1. 承認・差し戻し・期限切れ処理で使うステップ ID を `research-workflow.approval-step` に固定する。
2. 既存 Run の復元は `workflow.createRunAsync({ runId })` を使い、そこから `streamWorkflow` あるいは `run.resume` を呼ぶ。
3. これにより承認ボタン押下時もタイムアウトキャンセル時も正しく `approval-step` が再開され、gather フェーズが継続する。

関連ファイル:
- `src/slack/handlers/action-handler.ts`
- `src/jobs/deadline-checker.ts`
