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
    // 最後のユーザーメッセージからクエリを取得
    const lastMessage = input.messages[input.messages.length - 1];
    const content = lastMessage.content;
    const query = typeof content === 'string' ? content : 'デフォルトクエリ';

    // ワークフロー実行用の入力データ
    const workflowInput = {
      query,
      channelId: 'test-channel',
      userId: 'test-user',
    };

    // Mastraインスタンスからワークフローを取得して実行
    const workflow = mastra.getWorkflow('slack-research-hitl');
    const run = await workflow.createRunAsync();
    const result = await run.start({ inputData: workflowInput });

    // suspendされた場合は自動承認してresume
    if (result.status === 'suspended') {
      // @ts-expect-error - suspended property exists in runtime
      const suspended = result.suspended as string[] | undefined;

      if (!suspended || suspended.length === 0) {
        return [
          {
            role: 'assistant' as const,
            content: 'エラー: suspendされたステップが見つかりません',
          },
        ];
      }

      const stepToResume = suspended[0]; // 最初のsuspendedステップ

      const resumeResult = await run.resume({
        step: stepToResume,
        resumeData: {
          approved: true,
          approver: 'test-approver',
        },
      });

      if (resumeResult.status === 'success') {
        const report = (resumeResult.result as { report: string; approved: boolean }).report;
        return [
          {
            role: 'assistant' as const,
            content: report,
          },
        ];
      }

      return [
        {
          role: 'assistant' as const,
          content: `エラー: resume後のステータスが異常 - ${resumeResult.status}`,
        },
      ];
    } else if (result.status === 'success') {
      // suspendなしで成功した場合
      const report = (result.result as { report: string; approved: boolean }).report;
      return [
        {
          role: 'assistant' as const,
          content: report,
        },
      ];
    } else {
      // その他のステータス（failed等）
      return [
        {
          role: 'assistant' as const,
          content: `エラー: ワークフローが失敗しました - ${result.status}`,
        },
      ];
    }
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
          model: openai('gpt-4o'),
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
