import { createStep } from '@mastra/core/workflows';

import { approvalStepOutputSchema, gatherStepOutputSchema } from './schemas';

const buildGatherPrompt = (plan: string) => `以下の承認された調査計画を実行してください。

計画:
${plan}

指示:
- 各調査方法を順次実行し、進捗を記録してください
- Tavily MCP検索ツール(tavily.search)を使用して情報を発見し、evaluate-resultで各発見をスコアリングしてください
- 一次情報源で信頼性の高いソースを優先してください。重複を避けてください
- すべての情報源をタイトル + URL + 取得日時で明確に引用してください
- 未解決の質問や不足している証拠を指摘してください

**すべて日本語で応答してください。**`;

export const gatherStep = createStep({
  id: 'gather-step',
  inputSchema: approvalStepOutputSchema,
  outputSchema: gatherStepOutputSchema,
  execute: async ({ inputData, mastra, writer }) => {
    const emit = async (payload: Record<string, unknown>) => {
      await writer.write(payload);
    };

    if (!inputData.approved) {
      const message = 'Research was rejected - gather step will not run.';
      await emit({
        type: 'gather-progress',
        message,
      });
      throw new Error('Research was rejected - cannot proceed with gathering');
    }

    const researchAgent = mastra.getAgent('research-agent');
    const prompt = buildGatherPrompt(inputData.plan);

    try {
      const result = await researchAgent.generate(prompt, {
        maxSteps: 10,
        onStepFinish: async (step) => {
          const latestToolResult = step.toolResults.at(-1)?.payload;
          const latestToolCall = step.toolCalls.at(-1)?.payload;
          const toolLabel =
            latestToolResult?.toolName ?? latestToolCall?.toolName ?? 'model-reasoning';

          const detailText = (() => {
            const trimmedText = step.text.trim();
            if (trimmedText) {
              return trimmedText;
            }

            if (typeof latestToolResult?.result === 'string' && latestToolResult.result.trim()) {
              return latestToolResult.result.trim();
            }

            try {
              return JSON.stringify(latestToolResult?.result ?? latestToolCall ?? {}, null, 2);
            } catch {
              return 'No textual details provided for this step.';
            }
          })();

          await emit({
            type: 'gather-progress',
            message: `Step update: ${toolLabel}`,
            details: detailText,
          });
        },
      });

      await emit({
        type: 'gather-complete',
        message: 'Research data gathering completed',
      });

      return { ...inputData, researchData: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown gather-step error';
      await emit({
        type: 'gather-progress',
        message: `Gather step failed: ${message}`,
      });
      throw error;
    }
  },
});
