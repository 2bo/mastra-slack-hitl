import { openai } from '@ai-sdk/openai';
import * as scenario from '@langwatch/scenario';
import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { researchAgent } from '../agents/research-agent';

// Adapter for Mastra Agent
const mastraAgentAdapter: scenario.AgentAdapter = {
  role: scenario.AgentRole.AGENT,
  call: async (input) => {
    // MastraのgenerateをAI SDK v5フォーマットで直接取得し、そのまま返す
    const result = await researchAgent.generate(input.messages, { format: 'aisdk' });
    return result.response.messages ?? [];
  },
};

/**
 * LangWatch Scenario DSL の補足メモ（テスト仕様の意図）
 *
 * - scenario.userSimulatorAgent(...) : User役を担うシミュレーター。これが無いと user(...) を投げるときにエラーになる。
 * - scenario.proceed(n) : 以降の n ターン分、ユーザー⇔エージェントのやり取りを自動で進行させる。
 * - scenario.judge() : judgeAgent に会話ログと criteria を渡し、成功/失敗を判定させる。失敗ならその場でシナリオ終了。
 * - scenario.succeed('msg') : ここに到達した時点で即 success 終了。'msg' は成功理由として記録される。
 *
 * 方針：公式推奨どおり
 *   1) シナリオ内に judge/succeed などの判定ステップを入れる
 *   2) run結果の result.success をテスト側で expect する（ダブルチェック）
 */

/**
 * 共通のエージェント構成を生成するヘルパー
 * - 研究エージェント (Mastra)
 * - ユーザーシミュレーター (必須)
 * - ジャッジ (必要に応じて criteria を渡す)
 */
const makeAgents = (judgeCriteria?: string[]) => {
  const agents = [
    mastraAgentAdapter,
    scenario.userSimulatorAgent({
      model: openai('gpt-4o'),
      // ユーザーシミュレーターが脱線しないように指示を強める
      systemPrompt: `
あなたはテスターとして「シナリオ説明のテーマ」に沿った短い質問/依頼だけを日本語で行う。
- 1ターンにつき1文、20〜40文字程度。
- 挨拶・謝罪・雑談・メタコメントは禁止。
- 要望が伝わったら余計な追質問はしない。
`,
      temperature: 0.2,
      maxTokens: 128,
    }),
  ];

  if (judgeCriteria?.length) {
    agents.push(
      scenario.judgeAgent({
        model: openai('gpt-4.1-mini'),
        criteria: judgeCriteria,
      }),
    );
  }

  return agents;
};

describe('リサーチエージェント - スクリプトテスト', () => {
  it('固定スクリプトで量子コンピュータの調査を実行できること', async () => {
    await scenario.run({
      id: 'researchAgent-scripted-quantum',
      name: '量子コンピュータ調査（スクリプト）',
      description:
        'ユーザーが量子コンピュータについて調査を依頼し、追加で日本企業の取り組みを質問する',
      setId: 'researchAgent-scripted-tests',
      agents: makeAgents(),
      script: [
        scenario.user('最新の量子コンピュータの動向について調査してください。'),
        scenario.agent(),
        scenario.user('特に日本国内の企業の取り組みに焦点を当ててください。'),
        scenario.agent(),
        (state: scenario.ScenarioExecutionStateLike) => {
          if (state.messages.length < 4) {
            throw new Error('会話が短すぎます');
          }
        },
        scenario.succeed('リサーチエージェントが会話に参加しました。'),
      ],
    });
  });
});

describe('リサーチエージェント - シミュレーションテスト', () => {
  it('ハイブリッドアプローチ: 初期は固定、その後は動的に会話展開', async () => {
    const result = await scenario.run({
      id: 'researchAgent-hybrid-climate',
      name: '気候変動調査（ハイブリッド）',
      description: `
        ユーザーは気候変動に関する最新の科学的知見について調査を依頼します。
        環境問題に関心が高く、データに基づいた情報を求めています。
      `,
      setId: 'researchAgent-simulation-tests',
      agents: makeAgents([
        'エージェントは信頼できる情報源から調査している',
        'エージェントは科学的根拠に基づいた回答をしている',
      ]),
      script: [
        // 最初のやり取りは固定
        scenario.user('最新の気候変動に関する科学的知見を調査してください。'),
        scenario.agent(),
        // ここから3ターン自動で会話を展開
        scenario.proceed(2),
        // 判定
        scenario.judge(),
      ],
    });

    expect(result.success, result.reasoning ?? 'シナリオ失敗').toBe(true);
  });
});
