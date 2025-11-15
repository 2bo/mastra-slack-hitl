import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { deliverWorkflow } from './deliver-workflow';
import { researchWorkflow } from './research-workflow';
import { deliverStepOutputSchema, workflowContextSchema } from './steps/schemas';

const finalizeStep = createStep({
  id: 'finalize-step',
  inputSchema: deliverStepOutputSchema,
  outputSchema: z.object({
    report: z.string(),
    approved: z.boolean(),
  }),
  execute: async ({ inputData }) => ({
    report: inputData.report,
    approved: inputData.approved,
  }),
});

export const mainWorkflow = createWorkflow({
  id: 'slack-research-hitl',
  inputSchema: workflowContextSchema,
  outputSchema: z.object({
    report: z.string(),
    approved: z.boolean(),
  }),
})
  .then(researchWorkflow)
  .then(deliverWorkflow)
  .then(finalizeStep)
  .commit();
