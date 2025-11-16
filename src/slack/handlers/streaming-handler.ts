import type { Workflow, WorkflowStepStatus, WorkflowStreamEvent } from '@mastra/core/workflows';

import type { SlackMetadataRepository } from '../../db/client';
import {
  getChatStreamClient,
  type SlackChatStreamClient,
  type SlackClientWithChat,
} from '../utils/chat-stream';
import { APPROVAL_PROMPT_TEXT, buildApprovalRequestBlocks } from '../blocks/approval-blocks';
import { logger } from '../../logger';

type WorkflowRunInstance = Awaited<ReturnType<Workflow['createRunAsync']>>;

export interface SlackWorkflowInput {
  query?: string;
  channelId: string;
  userId: string;
}

interface SlackStreamContext {
  parentTs: string;
  streamTs?: string;
}

interface ResumeOptions {
  step: string | string[];
  resumeData: Record<string, unknown>;
}

interface StreamWorkflowOptions {
  resume?: ResumeOptions;
}

interface BaseWriterPayload {
  type: string;
  [key: string]: unknown;
}

interface PlanChunkPayload extends BaseWriterPayload {
  type: 'plan-chunk';
  chunk?: unknown;
}

interface PlanErrorPayload extends BaseWriterPayload {
  type: 'plan-error';
  message?: unknown;
}

interface PlanCompletePayload extends BaseWriterPayload {
  type: 'plan-complete';
  plan?: unknown;
}

interface GatherProgressPayload extends BaseWriterPayload {
  type: 'gather-progress';
  message?: unknown;
  details?: unknown;
}

interface GatherCompletePayload extends BaseWriterPayload {
  type: 'gather-complete';
  message?: unknown;
}

interface ReportChunkPayload extends BaseWriterPayload {
  type: 'report-chunk';
  chunk?: unknown;
}

interface ReportCompletePayload extends BaseWriterPayload {
  type: 'report-complete';
  report?: unknown;
}

type WriterPayload =
  | PlanChunkPayload
  | PlanErrorPayload
  | PlanCompletePayload
  | GatherProgressPayload
  | GatherCompletePayload
  | ReportChunkPayload
  | ReportCompletePayload
  | BaseWriterPayload;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isWriterPayload = (value: unknown): value is WriterPayload => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.type === 'string';
};

const extractWriterPayload = (event: WorkflowStreamEvent): WriterPayload | null => {
  if (event.type === 'workflow-step-output') {
    // Mastra's nested structure: event.payload.output.payload.output contains the writer payload
    const topOutput = event.payload.output;
    if (isRecord(topOutput)) {
      const innerPayload = topOutput.payload;
      if (isRecord(innerPayload)) {
        const writerData = innerPayload.output;
        return isWriterPayload(writerData) ? writerData : null;
      }
    }
  }

  return null;
};

const getPayloadId = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null || !('id' in payload)) {
    return undefined;
  }

  const id = (payload as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
};

const getPayloadStatus = (payload: unknown): WorkflowStepStatus | undefined => {
  if (typeof payload !== 'object' || payload === null || !('status' in payload)) {
    return undefined;
  }

  const status = (payload as { status?: unknown }).status;
  return typeof status === 'string' ? (status as WorkflowStepStatus) : undefined;
};

const formatGatherDetails = (payload: WriterPayload): string => {
  const baseMessage = typeof payload.message === 'string' ? payload.message : '';
  const details = typeof payload.details === 'string' ? payload.details.trim() : '';

  if (baseMessage && details) {
    return `\n\n• ${baseMessage}\n${details}`;
  }

  if (baseMessage) {
    return `\n\n• ${baseMessage}`;
  }

  return details ? `\n${details}` : '';
};

const postErrorToThread = async (
  chat: SlackChatStreamClient,
  channelId: string,
  parentTs: string,
  text: string,
) => {
  await chat.postMessage({
    channel: channelId,
    thread_ts: parentTs,
    text,
  });
};

interface WorkflowSuccessResult {
  status: 'success';
  result: { report?: string; approved?: boolean };
}

interface WorkflowFailedResult {
  status: 'failed';
  error?: { message?: string };
}

interface WorkflowSuspendedResult {
  status: 'suspended';
}

interface WorkflowGenericResult {
  status: 'running' | 'waiting' | 'pending' | 'canceled';
  result?: unknown;
  error?: unknown;
}

type WorkflowResultShape =
  | WorkflowSuccessResult
  | WorkflowFailedResult
  | WorkflowSuspendedResult
  | WorkflowGenericResult;

export const streamWorkflow = async (
  run: WorkflowRunInstance,
  input: SlackWorkflowInput,
  slackStream: SlackStreamContext,
  client: SlackClientWithChat,
  repo: SlackMetadataRepository,
  options?: StreamWorkflowOptions,
): Promise<void> => {
  const channelId = input.channelId;
  const parentTs = slackStream.parentTs;
  const streamTs = slackStream.streamTs;
  let slackStreamOpen = Boolean(streamTs);
  let planDraftMarkdown = '';
  let hasStreamedPlanChunks = false;
  let usedPlanFallback = false;
  const chat = getChatStreamClient(client);

  const appendToStream = async (text: string): Promise<void> => {
    if (!text || !slackStreamOpen || !streamTs) {
      return;
    }
    logger.debug({ runId: run.runId, preview: text.slice(0, 12) }, 'Appending to Slack stream');
    await chat.appendStream({ channel: channelId, ts: streamTs, markdown_text: text });
  };

  const stopSlackStream = async (finalText?: string): Promise<void> => {
    if (!slackStreamOpen || !streamTs) {
      return;
    }
    slackStreamOpen = false;
    // finalTextが明示的に渡された場合のみ使用（その他の内容は既にappendStreamで送信済み）
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

  try {
    const stream = options?.resume
      ? run.resumeStreamVNext({
          step: options.resume.step,
          resumeData: options.resume.resumeData,
        })
      : run.streamVNext({
          ...(input.query
            ? {
                inputData: {
                  query: input.query,
                  channelId: input.channelId,
                  userId: input.userId,
                },
              }
            : {}),
        });

    logger.debug(
      { runId: run.runId, resumed: Boolean(options?.resume) },
      'Streaming workflow events',
    );

    for await (const event of stream) {
      const eventStepId = getPayloadId(event.payload);
      logger.debug(
        { runId: run.runId, eventType: event.type, stepId: eventStepId },
        'Workflow event received',
      );
      const writerPayload = extractWriterPayload(event);
      if (writerPayload) {
        switch (writerPayload.type) {
          case 'plan-chunk':
            if (typeof writerPayload.chunk === 'string') {
              hasStreamedPlanChunks = true;
              planDraftMarkdown += writerPayload.chunk;
              await appendToStream(writerPayload.chunk);
              logger.debug({ runId: run.runId }, 'Appended plan chunk to Slack stream');
            }
            break;
          case 'plan-error':
            await appendToStream(
              `\n\n⚠️ 方針生成でエラー: ${
                typeof writerPayload.message === 'string' ? writerPayload.message : '詳細不明'
              }`,
            );
            break;
          case 'plan-complete':
            if (typeof writerPayload.plan === 'string') {
              planDraftMarkdown = writerPayload.plan;
              if (!hasStreamedPlanChunks) {
                usedPlanFallback = true;
                await appendToStream(writerPayload.plan);
                hasStreamedPlanChunks = true;
                logger.warn({ runId: run.runId }, 'Plan draft streamed via fallback payload');
              }
            }
            await appendToStream('\n\n✅ 調査方針のドラフトが完成しました。');
            break;
          case 'gather-progress':
            await appendToStream(`\n\n🧭 進捗更新${formatGatherDetails(writerPayload)}`);
            break;
          case 'gather-complete':
            await appendToStream('\n\n✅ 情報収集が完了しました。');
            break;
          case 'report-chunk':
            if (typeof writerPayload.chunk === 'string') {
              await appendToStream(writerPayload.chunk);
            }
            break;
          case 'report-complete':
            await appendToStream('\n\n✅ レポート生成が完了しました。');
            break;
          default:
            break;
        }
        continue;
      }

      if (
        event.type === 'workflow-step-suspended' &&
        getPayloadId(event.payload)?.endsWith('approval-step')
      ) {
        logger.debug(
          { runId: run.runId, status: getPayloadStatus(event.payload), stepId: eventStepId },
          'Approval step suspended event detected',
        );
        if (getPayloadStatus(event.payload) === 'suspended') {
          const fallbackText =
            !hasStreamedPlanChunks && planDraftMarkdown ? planDraftMarkdown : undefined;
          await stopSlackStream(fallbackText);
          const approvalMessage = await chat.postMessage({
            channel: channelId,
            thread_ts: parentTs,
            blocks: buildApprovalRequestBlocks(run.runId),
            text: APPROVAL_PROMPT_TEXT,
          });
          if (approvalMessage.ts) {
            await repo.updateApprovalMessageTs(run.runId, approvalMessage.ts);
          } else {
            logger.warn({ runId: run.runId }, 'Approval message TS missing from Slack response');
          }
          if (fallbackText && usedPlanFallback) {
            logger.info({ runId: run.runId }, 'Plan fallback text flushed on approval suspension');
          }
          logger.info({ runId: run.runId }, 'Workflow suspended for approval');
        }
      }
    }

    const workflowResult = (await stream.result) as WorkflowResultShape;

    if (workflowResult.status === 'suspended') {
      return;
    }

    if (workflowResult.status === 'success') {
      await stopSlackStream();
      const workflowOutput = workflowResult.result ?? {};
      const wasApproved =
        typeof workflowOutput.approved === 'boolean' ? workflowOutput.approved : true;

      if (!wasApproved) {
        const cancellationText =
          typeof workflowOutput.report === 'string' && workflowOutput.report.trim().length > 0
            ? workflowOutput.report
            : '❌ 差し戻しにより調査は実行されませんでした。';
        const response = await chat.postMessage({
          channel: channelId,
          thread_ts: parentTs,
          text: cancellationText,
        });
        if (response.ts) {
          await repo.updateThreadTs(run.runId, response.ts);
        }
        logger.info({ runId: run.runId }, 'Workflow cancelled after rejection');
        return;
      }

      // レポートは既にストリーミングで送信済み
      logger.info({ runId: run.runId }, 'Workflow completed successfully');
      return;
    }

    const statusText =
      workflowResult.status === 'failed'
        ? `❌ ワークフローでエラー: ${
            workflowResult.error && typeof workflowResult.error.message === 'string'
              ? workflowResult.error.message
              : '詳細不明'
          }`
        : `⚠️ ワークフローが ${workflowResult.status} 状態で終了しました。`;

    await stopSlackStream();
    await postErrorToThread(chat, channelId, parentTs, statusText);
    logger.warn(
      { runId: run.runId, status: workflowResult.status },
      'Workflow ended without success',
    );
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    logger.error({ err: error, runId: run.runId }, 'Workflow streaming error');
    await stopSlackStream();
    await postErrorToThread(chat, channelId, parentTs, `❌ エラーが発生しました: ${error.message}`);
    throw error;
  }
};
