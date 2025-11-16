import type { SlackCommandMiddlewareArgs } from '@slack/bolt';

import { getSlackMetadataRepository, getResearchRunsRepository } from '../../db/client';
import { getMastra } from '../../mastra';
import { streamWorkflow, type SlackWorkflowInput } from './streaming-handler';
import { getChatStreamClient, type SlackClientWithChat } from '../utils/chat-stream';
import { logger } from '../../logger';

export const handleResearchCommand = async ({
  command,
  ack,
  client,
}: SlackCommandMiddlewareArgs & { client: SlackClientWithChat }) => {
  await ack();

  const query = command.text.trim();
  const channelId = command.channel_id;
  const userId = command.user_id;
  const chat = getChatStreamClient(client);
  const teamId = command.team_id;
  let parentTs: string | null = null;

  if (!query) {
    await chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: '⚠️ 使用方法: `/research <調査テーマ>`',
    });
    return;
  }

  try {
    logger.info({ channelId, userId, teamId, query }, 'Received /research command');
    const mastra = await getMastra();
    const workflow = mastra.getWorkflow('slack-research-hitl');
    const run = (await workflow.createRunAsync()) as Parameters<typeof streamWorkflow>[0];
    logger.debug({ runId: run.runId }, 'Created workflow run');

    const repo = await getSlackMetadataRepository();
    await repo.create({
      runId: run.runId,
      channelId,
      requester: userId,
      deadlineAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    // 調査内容をDBに保存
    const researchRepo = await getResearchRunsRepository();
    await researchRepo.create({
      runId: run.runId,
      query,
    });

    const parentMessage = await chat.postMessage({
      channel: channelId,
      text: `🔍 調査を開始します: "${query}"\nこのメッセージのスレッドで進捗を共有します。`,
    });

    parentTs = parentMessage.ts ?? null;
    if (!parentTs) {
      throw new Error('Slack APIからparent_tsが返却されませんでした');
    }

    await repo.updateMessageTs(run.runId, parentTs);
    logger.debug({ runId: run.runId, parentTs }, 'Posted parent Slack message');

    const streamResponse = await chat.startStream({
      channel: channelId,
      thread_ts: parentTs,
      recipient_team_id: teamId,
      recipient_user_id: userId,
    });

    const streamTs = streamResponse.ts;
    if (!streamTs) {
      throw new Error('Slack APIからstream_tsが返却されませんでした');
    }

    await repo.updateThreadTs(run.runId, streamTs);
    logger.debug({ runId: run.runId, streamTs }, 'Slack chat stream started');

    const workflowInput: SlackWorkflowInput = {
      query,
      channelId,
      userId,
    };

    streamWorkflow(run, workflowInput, { parentTs, streamTs }, client, repo).catch(
      (streamError) => {
        logger.error({ err: streamError, runId: run.runId }, 'Failed during workflow streaming');
      },
    );
  } catch (unknownError) {
    const error = unknownError instanceof Error ? unknownError : new Error(String(unknownError));
    logger.error({ err: error, channelId, userId }, 'Failed to handle /research command');
    if (parentTs) {
      try {
        await chat.update({
          channel: channelId,
          ts: parentTs,
          text: `❌ 調査を開始できませんでした: ${error.message}`,
        });
      } catch (updateError) {
        logger.error({ err: updateError }, 'Failed to update Slack message after error');
      }
    }
    await chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `❌ 調査を開始できませんでした: ${error.message}`,
    });
  }
};
