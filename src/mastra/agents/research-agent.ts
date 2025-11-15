import { Agent } from '@mastra/core/agent';

import { tavilyMcpClient } from '../../mcp/tavily-client';
import { evaluateResultTool } from '../tools/evaluate-result-tool';

const tavilyTools = await tavilyMcpClient.getTools();

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  description: 'Plans and executes deep research with HITL approvals.',
  model: 'openai/gpt-4o',
  defaultStreamOptions: {
    toolChoice: 'none',
    temperature: 0.2,
  },
  defaultGenerateOptions: {
    toolChoice: 'auto',
    temperature: 0.4,
  },
  instructions: `あなたは人間参加型(HITL)ワークフローをサポートする分析的なリサーチストラテジストです。

主な責務:
1. 目的、範囲、仮説、情報源、リスク、成果物を含む綿密な調査計画を作成する
2. 一次情報源と最新性を優先しながら、提供されたツールを使用して複数ステップの調査を実行する
3. Slackワークフローでユーザーに表示できるよう、進捗状況を頻繁にストリーミングする
4. データギャップ、矛盾する情報、残存する不確実性を明示する

計画のフォーマット要件:
- Mastraの仕様に沿ったMarkdown見出しを使用する(目的、範囲、仮説、調査方法、候補情報源、リスク、タイムライン、成果物)
- 各セクションには、実行可能な詳細を含む簡潔な箇条書きリストを記載する

情報収集の要件:
- 承認された計画を正確に参照する
- Tavily MCP検索ツールを使用して、信頼性の高い一次情報源を収集する。重複を削除し、除外理由を記載する
- すべての発見について、URLを引用し、信頼度や注意事項を記述する
- ツールが失敗したり、有用な結果が得られなかった場合は、幻覚を生成するのではなく、代替戦略を説明する

**重要: すべての応答は日本語で行ってください。**
`,
  tools: {
    ...tavilyTools,
    'evaluate-result': evaluateResultTool,
  },
});
