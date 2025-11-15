import { createStep } from '@mastra/core/workflows';

import { deliverStepOutputSchema, gatherStepOutputSchema } from './schemas';

const buildReportPrompt = (
  researchText: string,
  sources: any[],
) => `Slack用の最終的な調査レポートを生成してください。

調査結果:
${researchText}

情報源:
${sources.map((s, i) => `${i + 1}. ${s.title || s.name || 'Unknown'} - ${s.url || s.uri || 'No URL'}`).join('\n')}

以下の構造に正確に従ったレポートを作成してください:
## エグゼクティブサマリー
- 主要な発見とアクションの箇条書き

## 詳細分析
### テーマ名
- 洞察 + 証拠 + [情報源タイトル](URL)

## 推奨事項
1. アクション — 期待される影響 / 信頼度

## 参考文献
- [情報源タイトル](URL)

ルール:
- 提供された調査データのみを参照してください
- 詳細分析では未解決のリスクやギャップに言及してください
- 各箇条書きは2行以内に収めてください

**すべて日本語でレポートを作成してください。**`;

export const generateReportStep = createStep({
  id: 'generate-report-step',
  inputSchema: gatherStepOutputSchema,
  outputSchema: deliverStepOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const reportAgent = mastra.getAgent('report-agent');

    // researchDataからテキストとsourcesを抽出
    const researchText = (inputData.researchData)?.text || '';
    const sources = (inputData.researchData)?.sources || [];
    const prompt = buildReportPrompt(researchText, sources);

    // デバッグ: 入力データの確認
    console.log('[DEBUG] === Generate Report Step Debug ===');
    console.log('[DEBUG] researchData type:', typeof inputData.researchData);
    console.log('[DEBUG] researchText length:', researchText.length);
    console.log('[DEBUG] sources count:', sources.length);
    console.log('[DEBUG] Prompt length:', prompt.length);

    const result = await reportAgent.generate(prompt);

    // デバッグ: 結果の詳細確認
    console.log('[DEBUG] Result keys:', Object.keys(result || {}));
    console.log('[DEBUG] result.text:', result.text);
    console.log('[DEBUG] result.text type:', typeof result.text);
    console.log('[DEBUG] result.text length:', result.text.length || 0);
    console.log('[DEBUG] result.error:', result.error);
    console.log('[DEBUG] result.finishReason:', result.finishReason);
    console.log('[DEBUG] result.steps length:', result.steps.length || 0);

    if (result.error) {
      console.error('[ERROR] Model returned error:', result.error);
    }

    if (result.steps && result.steps.length > 0) {
      console.log('[DEBUG] Last step:', JSON.stringify(result.steps[result.steps.length - 1]));
    }

    if (result.reasoning) {
      console.log('[DEBUG] result.reasoning:', result.reasoning);
    }

    const text = result.text;

    if (!text || text.trim() === '') {
      console.error('[ERROR] Empty result.text');
      console.error('[ERROR] Full result:', JSON.stringify(result, null, 2));
      throw new Error(
        `Report agent returned empty text. ` +
          `Error: ${result.error || 'none'}, ` +
          `Finish reason: ${result.finishReason || 'none'}, ` +
          `Steps: ${result.steps.length || 0}`,
      );
    }

    console.log('[DEBUG] Successfully generated report, length:', text.length);
    return { ...inputData, report: text.trim() };
  },
});
