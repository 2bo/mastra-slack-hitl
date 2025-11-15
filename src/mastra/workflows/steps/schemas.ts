import { z } from 'zod';

export const workflowContextSchema = z.object({
  query: z.string(),
  channelId: z.string(),
  userId: z.string(),
});

export const planStepInputSchema = workflowContextSchema.extend({
  query: workflowContextSchema.shape.query.min(3, '調査テーマは3文字以上で入力してください。'),
});

export const planStepOutputSchema = workflowContextSchema.extend({
  plan: z.string(),
});

export const approvalStepOutputSchema = planStepOutputSchema.extend({
  approved: z.boolean(),
  approver: z.string().optional(),
  reason: z.string().optional(),
});

export const gatherStepOutputSchema = approvalStepOutputSchema.extend({
  researchData: z.any(),
});

export const deliverStepOutputSchema = gatherStepOutputSchema.extend({
  report: z.string(),
});
