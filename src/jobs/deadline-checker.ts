import type { Workflow } from '@mastra/core/workflows';
import cron, { type ScheduledTask } from 'node-cron';

import { getSlackMetadataRepository } from '../db/client';
import { type SlackMetadataSelect } from '../db/schema';
import { getMastra } from '../mastra';
import { logger } from '../logger';
import {
  getChatStreamClient,
  type SlackChatStreamClient,
  type SlackClientWithChat,
} from '../slack/utils/chat-stream';

type WorkflowRunInstance = Awaited<ReturnType<Workflow['createRunAsync']>>;

const FIFTEEN_MIN_CRON = '*/15 * * * *';
const TIMEOUT_TEXT = '⏰ 承認期限が切れたため、調査は自動キャンセルされました。';

const notifyTimeout = async (
  chat: SlackChatStreamClient,
  metadata: SlackMetadataSelect,
): Promise<void> => {
  const threadTs = metadata.messageTs ?? undefined;
  const approvalMessageTs = metadata.approvalMessageTs ?? metadata.messageTs;
  await chat.postMessage({
    channel: metadata.channelId,
    thread_ts: threadTs,
    text: TIMEOUT_TEXT,
  });

  if (approvalMessageTs) {
    await chat.update({
      channel: metadata.channelId,
      ts: approvalMessageTs,
      text: TIMEOUT_TEXT,
      blocks: [],
    });
  }
};

type WorkflowRunControls = WorkflowRunInstance & {
  getStatus?: () => Promise<string>;
  resume: (options: {
    step: string | string[];
    resumeData: Record<string, unknown>;
  }) => Promise<void>;
};

const resumeWorkflowRun = async (workflow: Workflow, runId: string): Promise<void> => {
  const run = (await workflow.createRunAsync({ runId })) as WorkflowRunControls;
  const status = typeof run.getStatus === 'function' ? await run.getStatus() : null;

  if (status === 'suspended') {
    const approvalStepPath = 'research-workflow.approval-step';
    await run.resume({
      step: approvalStepPath,
      resumeData: {
        approved: false,
        reason: 'timeout',
        approver: 'system',
      },
    });
  }
};

export const startDeadlineChecker = (slackClient: SlackClientWithChat): ScheduledTask => {
  const chat = getChatStreamClient(slackClient);
  const task = cron.schedule(FIFTEEN_MIN_CRON, async () => {
    logger.debug('Running deadline checker...');
    try {
      const repo = await getSlackMetadataRepository();
      const expiredApprovals = await repo.getUnnotifiedExpiredApprovals();
      if (!expiredApprovals.length) {
        logger.debug('No expired approvals found');
        return;
      }

      const mastra = await getMastra();
      const workflow = mastra.getWorkflow('slack-research-hitl') as Workflow;

      for (const approval of expiredApprovals) {
        try {
          await repo.markTimeoutNotified(approval.runId);
          await notifyTimeout(chat, approval);
          await resumeWorkflowRun(workflow, approval.runId);
          logger.info({ runId: approval.runId }, 'Expired approval processed');
        } catch (error) {
          logger.error({ error, runId: approval.runId }, 'Failed to process expired approval');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Deadline checker run failed');
    }
  });

  logger.info('✅ Deadline checker scheduled (every 15 minutes)');
  return task;
};
