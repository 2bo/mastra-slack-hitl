import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { deliverWorkflow } from './deliver-workflow';
import { researchWorkflow } from './research-workflow';
import { workflowContextSchema } from './steps/schemas';

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
  .commit();
