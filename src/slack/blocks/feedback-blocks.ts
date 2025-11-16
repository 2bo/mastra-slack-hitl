/**
 * Context Actions Blockを使った調査結果フィードバックUI
 * https://docs.slack.dev/reference/block-kit/blocks/context-actions-block
 */

export const FEEDBACK_PROMPT_TEXT = '調査結果はいかがでしたか？';

export const buildFeedbackBlocks = (runId: string) => [
  {
    type: 'context_actions' as const,
    block_id: `feedback_${runId}`,
    elements: [
      {
        type: 'feedback_buttons' as const,
        action_id: 'research_feedback',
        positive_button: {
          text: { type: 'plain_text' as const, text: '👍' },
          value: `positive_${runId}`,
        },
        negative_button: {
          text: { type: 'plain_text' as const, text: '👎' },
          value: `negative_${runId}`,
        },
      },
    ],
  },
];
