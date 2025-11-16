import type { BlockAction, SlackActionMiddlewareArgs } from '@slack/bolt';
import type { Workflow } from '@mastra/core/workflows';

import { getSlackMetadataRepository } from '../../db/client';
import { getMastra } from '../../mastra';
import { streamWorkflow } from './streaming-handler';
import { getChatStreamClient, type SlackClientWithChat } from '../utils/chat-stream';
import { logger } from '../../logger';
import { buildApprovalStatusBlocks } from '../blocks/approval-blocks';

const formatSlackDateToken = (unixSeconds: number, label: string) =>
  `<!date^${unixSeconds}^${label}: {date_short} {time_secs}|${label}>`;

const buildStatusText = (options: {
  emoji: string;
  userId: string;
  verb: string;
  dateLabel: string;
  tail?: string;
}) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const humanizedDate = formatSlackDateToken(timestamp, options.dateLabel);
  const tail = options.tail ? `\n${options.tail}` : '';
  return `${options.emoji} <@${options.userId}> が${options.verb}（${humanizedDate}）${tail}`;
};

export const handleApproveAction = async ({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & { client: SlackClientWithChat }) => {
  await ack();
  const chat = getChatStreamClient(client);

  try {
    const action = body.actions[0];
    if (action.type !== 'button') {
      throw new Error('Invalid action type');
    }
    const runId = action.value;
    if (!runId) throw new Error('workflow run identifier is missing');
    logger.info({ runId, userId: body.user.id }, 'Approve button clicked');

    const repo = await getSlackMetadataRepository();
    const metadata = await repo.getByRunId(runId);
    if (!metadata) throw new Error('Slackメタデータが見つかりませんでした');
    if (!metadata.messageTs) throw new Error('SlackメッセージのTSが見つかりませんでした');
    const approvalMessageTs = metadata.approvalMessageTs ?? metadata.messageTs;

    const mastra = await getMastra();
    const workflow = mastra.getWorkflow('slack-research-hitl') as Workflow;
    const run = await workflow.createRunAsync({ runId });

    const approvalStatusText = buildStatusText({
      emoji: '✅',
      userId: body.user.id,
      verb: '承認しました',
      dateLabel: '承認',
      tail: '本調査を開始します...',
    });

    await chat.update({
      channel: metadata.channelId,
      ts: approvalMessageTs,
      text: '✅ 承認されました。本調査を開始します...',
      blocks: buildApprovalStatusBlocks(approvalStatusText),
    });

    const streamResponse = await chat.startStream({
      channel: metadata.channelId,
      thread_ts: metadata.messageTs,
      recipient_team_id: body.team?.id,
      recipient_user_id: metadata.requester,
    });

    const streamTs = streamResponse.ts;
    if (!streamTs) {
      throw new Error('Slack APIからstream_tsが返却されませんでした');
    }

    await repo.updateThreadTs(runId, streamTs);

    const approvalStepPath = 'research-workflow.approval-step';

    streamWorkflow(
      run,
      { channelId: metadata.channelId, userId: metadata.requester },
      { parentTs: metadata.messageTs, streamTs },
      client,
      repo,
      {
        resume: {
          step: approvalStepPath,
          resumeData: {
            approved: true,
            approver: body.user.id,
          },
        },
      },
    ).catch((streamError) => {
      logger.error({ err: streamError, runId }, 'Failed to resume workflow after approval');
    });
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    logger.error({ err: error }, 'Failed to process approve action');
    const channel = body.channel?.id;
    if (channel) {
      await chat.postEphemeral({
        channel,
        user: body.user.id,
        text: `❌ 承認処理に失敗しました: ${error.message}`,
      });
    }
  }
};

export const handleRejectAction = async ({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockAction> & { client: SlackClientWithChat }) => {
  await ack();
  const chat = getChatStreamClient(client);

  try {
    const action = body.actions[0];
    if (action.type !== 'button') {
      throw new Error('Invalid action type');
    }
    const runId = action.value;
    if (!runId) throw new Error('workflow run identifier is missing');
    logger.info({ runId, userId: body.user.id }, 'Reject button clicked');

    const repo = await getSlackMetadataRepository();
    const metadata = await repo.getByRunId(runId);
    if (!metadata) throw new Error('Slackメタデータが見つかりませんでした');
    if (!metadata.messageTs) throw new Error('SlackメッセージのTSが見つかりませんでした');
    const approvalMessageTs = metadata.approvalMessageTs ?? metadata.messageTs;

    const mastra = await getMastra();
    const workflow = mastra.getWorkflow('slack-research-hitl') as Workflow;
    const run = await workflow.createRunAsync({ runId });

    const rejectionStatusText = buildStatusText({
      emoji: '❌',
      userId: body.user.id,
      verb: '差し戻しました',
      dateLabel: '差し戻し',
      tail: '調査は中止されました。',
    });

    await chat.update({
      channel: metadata.channelId,
      ts: approvalMessageTs,
      text: '❌ 差し戻されました。調査は中止されました。',
      blocks: buildApprovalStatusBlocks(rejectionStatusText),
    });

    const approvalStepPath = 'research-workflow.approval-step';

    streamWorkflow(
      run,
      { channelId: metadata.channelId, userId: metadata.requester },
      { parentTs: metadata.messageTs, streamTs: undefined },
      client,
      repo,
      {
        resume: {
          step: approvalStepPath,
          resumeData: {
            approved: false,
            approver: body.user.id,
            reason: 'rejected by user',
          },
        },
      },
    ).catch((streamError) => {
      logger.error({ err: streamError, runId }, 'Failed to handle workflow rejection');
    });
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    logger.error({ err: error }, 'Failed to process reject action');
    const channel = body.channel?.id;
    if (channel) {
      await chat.postEphemeral({
        channel,
        user: body.user.id,
        text: `❌ 差し戻し処理に失敗しました: ${error.message}`,
      });
    }
  }
};
