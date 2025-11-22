# LangWatch シミュレーションテスト概要と運用メモ

## 概要
- LangWatch Scenario は「会話スクリプト」と「エージェント（User/Agent/Judge）」で構成する対話テストフレームワーク。
  - `scenario.run` が会話を実行し、JudgeAgent の verdict と met/unmet criteria を返す。
  - 結果は `result.success`, `result.reasoning`, `metCriteria`, `unmetCriteria` として取得でき、テスト側で assert できる。
- 本リポでの目的：リサーチエージェントの振る舞いを対話形式で検証し、ツール呼び出しや応答品質を自動チェックする。
- 主なシナリオ: 量子コンピュータ調査（動的）、AI 技術動向調査（動的）、気候変動調査（ハイブリッド）。

## 1. エージェント/ユーザーシミュレーターの挙動
- `userSimulatorAgent` は毎ターン、シナリオ `description` を埋め込んだ system プロンプトを先頭に付けて LLM に問い合わせる。`proceed()` 中も再付与される。
- デフォルトは「短く人間ユーザーを装う」程度なので、テーマ外に脱線する可能性あり。制御する場合は `systemPrompt` / `temperature` / `maxTokens` を上書きする。

## 2. `proceed(n)` の意味
- ユーザーシミュレーターと被テストエージェントの自動対話を n ターン進めるステップ。長めにするとテーマドリフトが起こりやすい。

## 3. 合否判定の流れ
- `judgeAgent` は `criteria` を基に verdict を返す。達成率 100% でなくても verdict が success なら `result.success` は true。
- 厳格に落としたい場合: テスト側で `expect(result.unmetCriteria?.length ?? 0).toBe(0)` のように未達を明示チェックする。

## 4. よく使う DSL ステップ
- `user(content?)` / `agent(content?)` / `proceed(turns)` / `judge()` / `succeed(reason?)` / `fail(reason?)`
- 早期終了したいときは `fail()`、十分なら `succeed()` を挟む。

## 5. ヘッドレス実行
- ブラウザを開かせない: `SCENARIO_HEADLESS=true pnpm test`

## 6. 脱線対策
- `description` にテーマ外禁止を明文化。
- `userSimulatorAgent` にカスタム `systemPrompt` でテーマ外禁止・低温度を設定。
- `proceed` を短めにし、重要ターンは `user()` で固定。
- `judge` の criteria に「テーマ外発話なし」を追加し、未達なら fail。

## 7. 判定ロジック注意点
- verdict が最終決定権。クリテリア未達でも success になることがあるので、重要条件はテスト側 assert で二重化。

## 8. プロンプトの流れ
- 毎ターン `description` 付き system メッセージ → 既存履歴（role 反転）→ LLM → `role: user` で返却。

## 9. ターン設計ベストプラクティス
- 長い自動進行はドリフト要因。要所は固定スクリプト、`proceed` は短く。

## 10. 実行コマンド例
- 全体: `pnpm test`
- ブラウザ抑止: `SCENARIO_HEADLESS=true pnpm test`
- 個別: `pnpm vitest src/mastra/tests/simulation.test.ts -t "ハイブリッドアプローチ"`

## 11. 観察された挙動
- テーマ外（映画・祭り等）に脱線するケースあり → systemPrompt 強化と低温度で軽減。
- Judge の criteria を増やすと厳格になるが、ばらつきで false negative もありうるため、重要項目はテスト側 assert を推奨。
