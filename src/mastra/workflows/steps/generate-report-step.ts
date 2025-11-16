import { createStep } from '@mastra/core/workflows';

import { deliverStepOutputSchema, gatherStepOutputSchema } from './schemas';

interface ResearchSource {
  title?: string;
  name?: string;
  url?: string;
  uri?: string;
}

interface ResearchDataShape {
  text?: string;
  sources?: ResearchSource[];
}

interface AgentGenerateTextResult {
  text?: string;
  steps?: unknown[];
  error?: unknown;
  finishReason?: unknown;
  reasoning?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const normalizeResearchData = (raw: unknown): Required<ResearchDataShape> => {
  if (isRecord(raw)) {
    const text =
      typeof raw.text === 'string' && raw.text.trim().length > 0 ? raw.text : stringifyUnknown(raw);
    const sources = Array.isArray(raw.sources)
      ? raw.sources.filter((item): item is ResearchSource => isRecord(item))
      : [];
    return { text, sources };
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    return { text: raw, sources: [] };
  }

  return { text: stringifyUnknown(raw), sources: [] };
};

const normalizeAgentResult = (raw: unknown): AgentGenerateTextResult => {
  if (typeof raw === 'string') {
    return { text: raw };
  }
  if (isRecord(raw)) {
    const normalized: AgentGenerateTextResult = {};
    if (typeof raw.text === 'string') {
      normalized.text = raw.text;
    }
    if (Array.isArray(raw.steps)) {
      normalized.steps = raw.steps;
    }
    if ('error' in raw) {
      normalized.error = raw.error;
    }
    if ('finishReason' in raw) {
      normalized.finishReason = raw.finishReason;
    }
    if ('reasoning' in raw) {
      normalized.reasoning = raw.reasoning;
    }
    return normalized;
  }
  return {};
};

const buildReportPrompt = (
  researchText: string,
  sources: ResearchSource[],
) => `Slack用の最終的な調査レポートを生成してください。

調査結果:
${researchText}

情報源:
${sources.length > 0 ? sources.map((source, index) => `${index + 1}. ${source.title ?? source.name ?? 'Unknown'} - ${source.url ?? source.uri ?? 'No URL'}`).join('\n') : '1. 情報源なし'}

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
  execute: async ({ inputData, mastra, writer }) => {
    const emit = async (payload: Record<string, unknown>) => {
      await writer.write(payload);
    };

    if (!inputData.approved) {
      const cancellationMessage =
        '❌ 差し戻しのため調査を中止しました。承認後に再実行してください。';
      await emit({
        type: 'report-complete',
        report: cancellationMessage,
      });
      return { ...inputData, report: cancellationMessage };
    }

    const reportAgent = mastra.getAgent('report-agent');

    const { text: researchText, sources } = normalizeResearchData(
      inputData.researchData as ResearchDataShape,
    );
    const prompt = buildReportPrompt(researchText, sources);

    // デバッグ: 入力データの確認
    console.log('[DEBUG] === Generate Report Step Debug ===');
    console.log('[DEBUG] researchData type:', typeof inputData.researchData);
    console.log('[DEBUG] researchText length:', researchText.length);
    console.log('[DEBUG] sources count:', sources.length);
    console.log('[DEBUG] Prompt length:', prompt.length);

    let streamedReport = '';
    let chunkCount = 0;
    try {
      const stream = await reportAgent.stream(prompt);
      console.log('[DEBUG] Report streaming started');
      for await (const chunk of stream.textStream) {
        chunkCount += 1;
        streamedReport += chunk;
        await emit({
          type: 'report-chunk',
          chunk,
        });
      }

      let rawResult: unknown = null;
      try {
        rawResult = await stream.getFullOutput();
      } catch (metaError) {
        console.warn('[WARN] Failed to read full report output:', metaError);
      }
      const result = normalizeAgentResult(rawResult ?? {});

      // デバッグ: 結果の詳細確認
      console.log('[DEBUG] Stream chunk count:', chunkCount);
      console.log(
        '[DEBUG] Result keys:',
        isRecord(rawResult) ? Object.keys(rawResult) : 'raw-result-unavailable',
      );
      console.log('[DEBUG] result.text:', result.text);
      console.log('[DEBUG] result.text type:', typeof result.text);
      console.log('[DEBUG] result.text length:', result.text?.length ?? 0);
      console.log('[DEBUG] result.error:', result.error);
      console.log('[DEBUG] result.finishReason:', result.finishReason);
      console.log('[DEBUG] result.steps length:', result.steps?.length ?? 0);

      if (result.error) {
        console.error('[ERROR] Model returned error:', result.error);
      }

      if (Array.isArray(result.steps) && result.steps.length > 0) {
        console.log('[DEBUG] Last step:', stringifyUnknown(result.steps[result.steps.length - 1]));
      }

      if (result.reasoning) {
        console.log('[DEBUG] result.reasoning:', result.reasoning);
      }

      let finalReport = streamedReport.trim();
      if (!finalReport && result.text) {
        finalReport = result.text.trim();
      }

      if (!finalReport) {
        console.error('[ERROR] Empty report after streaming');
        console.error('[ERROR] Full result:', stringifyUnknown(rawResult));
        const finishReason =
          typeof result.finishReason === 'string' && result.finishReason.trim().length > 0
            ? result.finishReason
            : 'none';
        throw new Error(
          `Report agent returned empty text after streaming. ` +
            `Error: ${result.error ? stringifyUnknown(result.error) : 'none'}, ` +
            `Finish reason: ${finishReason}, ` +
            `Steps: ${result.steps?.length ?? 0}`,
        );
      }

      await emit({
        type: 'report-complete',
        report: finalReport,
      });
      console.log('[DEBUG] Successfully streamed report, length:', finalReport.length);

      return { ...inputData, report: finalReport };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error while streaming report';
      console.error('[ERROR] Report streaming failed:', message);
      throw error;
    }
  },
});
