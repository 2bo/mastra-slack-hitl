# ワークフローストリーミング問題の修正

## 問題の症状

planステップで `writer.write()` を使用してイベントを発行しているにもかかわらず、Slackにストリームが表示されない問題が発生していました。

### ログの状況

```json
{"level":20,"time":1763256894924,"pid":70061,"msg":"Plan chunk emitted"}
{"level":20,"time":1763256895091,"pid":70061,"eventType":"workflow-step-output","msg":"Workflow event received"}
{"level":30,"time":1763256895091,"pid":70061,"planLength":794,"msg":"Plan step completed"}
```

- ✅ "Plan chunk emitted" - `writer.write()` は実行されている
- ✅ "workflow-step-output" イベントは受信している
- ❌ "Appended plan chunk to Slack stream" のログが出ない

## 根本原因

**Mastraの `writer.write()` イベントのネスト構造が予想以上に深かった**

### 当初の想定

`streaming-handler.ts` の `extractWriterPayload()` 関数は、以下のような構造を想定していました：

```typescript
// 想定していた構造（誤り）
event.payload.output → { type: 'plan-chunk', chunk: '...' }
```

### 実際の構造

デバッグログで確認した実際のイベント構造：

```json
{
  "type": "workflow-step-output",
  "payload": {
    "output": {
      "type": "workflow-step-output",
      "payload": {
        "output": {
          "type": "plan-chunk",  ← ライターペイロードはここ！
          "chunk": "..."
        }
      }
    }
  }
}
```

**正しいパス**: `event.payload.output.payload.output`

## 調査プロセス

### 1. 初期調査

Mastraドキュメントとコードを確認し、以下を発見：
- `writer.write()` が正しく使用されている
- イベントは `workflow-step-output` タイプで発行される
- しかし、ペイロード抽出ロジックが機能していない

### 2. デバッグログの追加

`streaming-handler.ts` に一時的なデバッグログを追加：

```typescript
if (event.type === 'workflow-step-output') {
  logger.debug(
    {
      runId: run.runId,
      payloadKeys: Object.keys(event.payload || {}),
      payloadPreview: JSON.stringify(event.payload).slice(0, 200)
    },
    'DEBUG: workflow-step-output payload structure'
  );
}
```

### 3. 実際のペイロード構造を確認

ログから以下が判明：

```json
{
  "payloadKeys": ["output", "runId", "stepName"],
  "payloadPreview": "{\"output\":{\"type\":\"workflow-step-output\",\"payload\":{\"output\":{\"type\":\"plan-chunk\",\"chunk\":\"します\"}}}"
}
```

## 解決方法

### 修正前のコード

```typescript
const extractWriterPayload = (event: WorkflowStreamEvent): WriterPayload | null => {
  if (event.type === 'workflow-step-output') {
    const output = event.payload.output;  // ❌ 1階層浅すぎる
    return isWriterPayload(output) ? output : null;
  }

  const writerEvent = event as { type?: string; payload?: unknown };
  if (writerEvent.type === 'workflow-step-writer') {  // ❌ 存在しないイベントタイプ
    return isWriterPayload(writerEvent.payload) ? writerEvent.payload : null;
  }

  return null;
};
```

### 修正後のコード

```typescript
const extractWriterPayload = (event: WorkflowStreamEvent): WriterPayload | null => {
  if (event.type === 'workflow-step-output') {
    // Mastra's nested structure: event.payload.output.payload.output contains the writer payload
    const topOutput = event.payload.output;
    if (typeof topOutput === 'object' && topOutput !== null) {
      const innerPayload = (topOutput as Record<string, unknown>).payload;
      if (typeof innerPayload === 'object' && innerPayload !== null) {
        const writerData = (innerPayload as Record<string, unknown>).output;
        return isWriterPayload(writerData) ? writerData : null;
      }
    }
  }

  return null;
};
```

### 変更のポイント

1. **正しいパスへのアクセス**: `event.payload.output.payload.output` に到達
2. **安全なネストアクセス**: 各階層で型チェックを実施
3. **不要なコードの削除**: 存在しない `workflow-step-writer` イベントタイプのチェックを削除

## 結果

修正後、以下が正常に動作するようになりました：

- ✅ planステップのチャンクがリアルタイムでSlackにストリーム表示
- ✅ "Appended plan chunk to Slack stream" ログが出力
- ✅ gatherステップも同様に動作（同じメカニズム）

## Mastraのワークフローストリーミング構造

### writer.write() の使用方法

```typescript
// ステップ内で
await writer.write({
  type: 'custom-event-type',
  data: 'some data'
});
```

### イベント構造の階層

```
WorkflowStreamEvent
└─ type: 'workflow-step-output'
   └─ payload
      ├─ runId
      ├─ stepName
      └─ output
         └─ type: 'workflow-step-output'
            └─ payload
               └─ output          ← ここに writer.write() のペイロード
                  ├─ type: 'custom-event-type'
                  └─ data: 'some data'
```

### イベント抽出のベストプラクティス

```typescript
const extractWriterPayload = (event: WorkflowStreamEvent): WriterPayload | null => {
  if (event.type === 'workflow-step-output') {
    // 3階層のネストを安全にたどる
    const topOutput = event.payload.output;
    if (typeof topOutput === 'object' && topOutput !== null) {
      const innerPayload = (topOutput as Record<string, unknown>).payload;
      if (typeof innerPayload === 'object' && innerPayload !== null) {
        const writerData = (innerPayload as Record<string, unknown>).output;
        return isWriterPayload(writerData) ? writerData : null;
      }
    }
  }
  return null;
};
```

## 教訓

1. **ドキュメントだけでは不十分**: Mastraの公式ドキュメントでは、このネスト構造の詳細が明記されていない
2. **実際のデータ構造を確認**: デバッグログで実際のイベント構造を確認することが重要
3. **型安全性**: TypeScriptの型システムだけでは、実行時のデータ構造の深さを保証できない

---

## 問題2: ストリーミング内容の重複投稿

### 症状

イベント抽出の問題を修正した後、planステップの内容がSlackに **2回投稿される** 問題が発生しました。

**投稿例**:
```
## 目的
- Mastraの定義、用途、関連技術を明確にする
...
✅ 調査方針のドラフトが完成しました。

## 目的  ← 同じ内容が再度投稿される
- Mastraの定義、用途、関連技術を明確にする
...
✅ 調査方針のドラフトが完成しました。
```

### 根本原因

`stopSlackStream()` 関数で、既に `appendStream()` で送信済みの内容を `bufferedText` として再送信していました。

**問題のあったコード**:

```typescript
const appendToStream = async (text: string): Promise<void> => {
  if (!text || !slackStreamOpen || !streamTs) {
    return;
  }
  bufferedText += text;  // ← 送信内容をバッファに蓄積
  await chat.appendStream({ channel: channelId, ts: streamTs, markdown_text: text });
};

const stopSlackStream = async (finalText?: string): Promise<void> => {
  // ...
  const text = finalText ?? bufferedText;  // ← bufferedTextにフォールバック
  await chat.stopStream({
    channel: channelId,
    ts: streamTs,
    ...(text ? { markdown_text: text } : {}),  // ← 既存の内容を再送信！
  });
  bufferedText = '';
};
```

**動作の流れ**:
1. `appendStream` で "内容A" を送信 → Slackに表示される
2. `bufferedText` に "内容A" を蓄積
3. `stopStream` 呼び出し時に `bufferedText` (= "内容A") を再送信
4. 結果: "内容A" が2回表示される

### 修正内容

**修正後のコード**:

```typescript
const appendToStream = async (text: string): Promise<void> => {
  if (!text || !slackStreamOpen || !streamTs) {
    return;
  }
  // bufferedTextへの蓄積を削除
  await chat.appendStream({ channel: channelId, ts: streamTs, markdown_text: text });
};

const stopSlackStream = async (finalText?: string): Promise<void> => {
  if (!slackStreamOpen || !streamTs) {
    return;
  }
  slackStreamOpen = false;
  // finalTextが明示的に渡された場合のみ使用
  try {
    await chat.stopStream({
      channel: channelId,
      ts: streamTs,
      ...(finalText ? { markdown_text: finalText } : {}),
    });
  } catch (stopError) {
    logger.error({ err: stopError, channelId, streamTs }, 'Failed to stop Slack stream');
  }
};
```

**変更のポイント**:
1. `bufferedText` 変数を完全に削除
2. `appendStream()` では単純に内容を送信するだけ
3. `stopStream()` では明示的に渡された `finalText` のみを使用
4. 既に送信済みの内容は再送信しない

### Slack API の仕様

Slack Chat Streaming APIの動作：
- `chat.startStream` - ストリームを開始
- `chat.appendStream` - ストリームに内容を追加（**累積的に表示される**）
- `chat.stopStream` - ストリームを終了
  - `markdown_text` パラメータは **オプション**
  - 渡された場合、最終的な内容として使用される可能性がある
  - **推奨**: 既に `appendStream` で送信済みの内容は渡さない

### 結果

修正後の動作：
- ✅ planステップの内容が1回のみ表示される
- ✅ チャンクがリアルタイムでストリーミングされる
- ✅ 完了メッセージ「✅ 調査方針のドラフトが完成しました。」も1回のみ表示される
- ✅ 重複投稿が解消される

### 教訓

1. **APIの意味を理解する**: `stopStream` の `markdown_text` パラメータの目的を理解せずに使うと問題が起きる
2. **バッファリングの必要性を検討**: リアルタイムストリーミングでは、既に送信済みの内容をバッファに保持する必要がない場合が多い
3. **フォールバック処理に注意**: `finalText ?? bufferedText` のようなフォールバックは、意図しない重複を引き起こす可能性がある

---

## 参考情報

- 修正ファイル: `src/slack/handlers/streaming-handler.ts`
- 関連ファイル: `src/mastra/workflows/steps/plan-step.ts`, `src/mastra/workflows/steps/gather-step.ts`
- Mastraドキュメント: [Workflow Streaming](https://mastra.ai/docs/streaming/workflow-streaming)
- Slack API: [Chat Streaming](https://docs.slack.dev/changelog/2025/10/7/chat-streaming/)
