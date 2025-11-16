export const APPROVAL_PROMPT_TEXT = '📋 調査方針が生成されました。承認してください。';

const buildApprovalPromptSection = () => ({
  type: 'section' as const,
  text: {
    type: 'mrkdwn' as const,
    text: APPROVAL_PROMPT_TEXT,
  },
});

export const buildApprovalRequestBlocks = (runId: string) => [
  buildApprovalPromptSection(),
  {
    type: 'actions' as const,
    block_id: `approval_${runId}`,
    elements: [
      {
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: '✅ 承認して本調査を開始' },
        style: 'primary' as const,
        action_id: 'approve',
        value: runId,
      },
      {
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: '❌ 差し戻し' },
        style: 'danger' as const,
        action_id: 'reject',
        value: runId,
      },
    ],
  },
];

export const buildApprovalStatusBlocks = (statusText: string) => [
  buildApprovalPromptSection(),
  {
    type: 'section' as const,
    text: {
      type: 'mrkdwn' as const,
      text: statusText,
    },
  },
];
