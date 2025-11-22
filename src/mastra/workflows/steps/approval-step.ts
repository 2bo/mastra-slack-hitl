import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { approvalStepOutputSchema, planStepOutputSchema } from './schemas';

export const approvalStep = createStep({
  id: 'approval-step',
  inputSchema: planStepOutputSchema,
  outputSchema: approvalStepOutputSchema,
  suspendSchema: z.object({
    plan: z.string(),
    requestedAt: z.number(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    approver: z.string(),
    reason: z.string().optional(),
  }),
  execute: async (context) => {
    const { inputData, resumeData } = context;

    if (!resumeData) {
      return context.suspend({
        plan: inputData.plan,
        requestedAt: Date.now(),
      }) as Promise<never>;
    }

    return {
      ...inputData,
      approved: resumeData.approved,
      approver: resumeData.approver,
      reason: resumeData.reason,
    };
  },
});
