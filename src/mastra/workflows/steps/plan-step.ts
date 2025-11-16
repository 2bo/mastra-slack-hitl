import { createStep } from '@mastra/core/workflows';

import { planStepInputSchema, planStepOutputSchema } from './schemas';
import { logger } from '../../../logger';

const PLAN_PROMPT_TEMPLATE = (query: string) => `あなたはHITLワークフローのリサーチリーダーです。

以下のリクエストに対する包括的な調査計画を作成してください:
"${query}"

以下のセクションとガイダンスに従ってMarkdown形式で出力してください:
## 目的
- 回答すべき主な質問

## 範囲と境界
- 調査範囲内 / 調査範囲外の箇条書き

## 主要な仮説
- 検証すべき2〜4つの反証可能な主張

## 調査方法と手法
- ステップバイステップのアプローチ、ツール、成功基準

## 候補情報源
- 主要なデータベース、規制当局、最新レポートなどを優先

## リスクと未知数
- ギャップ、障害、必要な明確化

## タイムラインと成果物
- タイムボックス、更新頻度、レポート概要

**すべて日本語で出力してください。**`;

export const planStep = createStep({
  id: 'plan-step',
  inputSchema: planStepInputSchema,
  outputSchema: planStepOutputSchema,
  execute: async ({ inputData, mastra, writer }) => {
    const researchAgent = mastra.getAgent('research-agent');
    const prompt = PLAN_PROMPT_TEMPLATE(inputData.query);
    const writeEvent = async (payload: Record<string, unknown>) => {
      await writer.write(payload);
    };

    let plan = '';
    try {
      logger.info({ query: inputData.query }, 'Plan step started');
      const stream = await researchAgent.stream(prompt);
      for await (const chunk of stream.textStream) {
        plan += chunk;
        await writeEvent({
          type: 'plan-chunk',
          chunk,
        });
        logger.debug({ chunkLength: chunk.length }, 'Plan chunk emitted');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error while generating plan';
      await writeEvent({
        type: 'plan-error',
        message,
      });
      logger.error({ err: error }, 'Plan step failed');
      throw error;
    }

    const normalizedPlan = plan.trim();

    await writeEvent({
      type: 'plan-complete',
      plan: normalizedPlan,
    });
    logger.info({ planLength: normalizedPlan.length }, 'Plan step completed');

    return { ...inputData, plan: normalizedPlan };
  },
});
