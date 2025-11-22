import { openai } from '@ai-sdk/openai';
import * as scenario from '@langwatch/scenario';
import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { mastra } from '../index';

/**
 * mainWorkflowに対するLangWatch Scenarioシミュレーションテスト
 *
 * テストシナリオ：
 * - ユーザーが調査を依頼
 * - ワークフローが計画を生成（planStep）
 * - 自動承認（approvalStep）
 * - 調査実行（gatherStep）
 * - レポート生成（generateReportStep）
 * - ジャッジが品質を評価
 */

// Adapter for Mastra Workflow (mainWorkflow)
const mainWorkflowAdapter: scenario.AgentAdapter = {
  role: scenario.AgentRole.AGENT,
  call: async (input) => {
    const lastMessage = input.messages.at(-1);
    const query =
      typeof lastMessage?.content === 'string' ? lastMessage.content : 'デフォルトクエリ';

    const workflow = mastra.getWorkflow('slack-research-hitl');
    const run = await workflow.createRunAsync();

    let result = await run.start({
      inputData: { query, channelId: 'test-channel', userId: 'test-user' },
    });

    // suspendされた場合は自動承認してresume
    if (result.status === 'suspended') {
      const stepId = result.suspended.at(0);
      if (!stepId) throw new Error('Suspended state missing step ID');

      result = await run.resume({
        step: stepId,
        resumeData: { approved: true, approver: 'test-approver' },
      });
    }

    if (result.status !== 'success') {
      throw new Error(`Workflow execution failed: ${result.status}`);
    }

    const report = (result.result as { report: string }).report;
    return [{ role: 'assistant', content: report }];
  },
};

describe('mainWorkflow - シミュレーションテスト', () => {
  it('シンプルなクエリでワークフロー全体が実行され、レポートが生成されること', async () => {
    const result = await scenario.run({
      id: 'mainWorkflow-simple',
      name: 'AI調査ワークフロー実行テスト',
      description: 'ユーザーがAIトレンドについて調査を依頼し、適切なレポートが生成されることを確認',
      setId: 'workflow-simulation-tests',
      agents: [
        mainWorkflowAdapter,
        scenario.userSimulatorAgent({
          model: openai('gpt-4.1-mini'),
          systemPrompt: `
あなたはテスターとして調査を依頼します。
- シンプルで明確な調査依頼を日本語で行う。
- 余計な会話はしない。
`,
          temperature: 0.2,
          maxTokens: 128,
        }),
        scenario.judgeAgent({
          model: openai('gpt-4o-mini'),
          criteria: [
            'レポートには調査内容が含まれている',
            'レポートは論理的に構成されている',
            'レポートは日本語で記述されている',
          ],
        }),
      ],
      script: [
        scenario.user('AIの最新トレンドについて調査してください'),
        scenario.agent(),
        scenario.judge(),
      ],
    });

    expect(result.success, result.reasoning ?? 'シナリオ失敗').toBe(true);
  }, 180000); // タイムアウト180秒（検索含むため）
});
