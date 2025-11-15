import { createWorkflow } from '@mastra/core/workflows';

import { gatherStepOutputSchema, planStepInputSchema } from './steps/schemas';
import { approvalStep } from './steps/approval-step';
import { gatherStep } from './steps/gather-step';
import { planStep } from './steps/plan-step';

export const researchWorkflow = createWorkflow({
  id: 'research-workflow',
  inputSchema: planStepInputSchema,
  outputSchema: gatherStepOutputSchema,
})
  .then(planStep)
  .then(approvalStep)
  .then(gatherStep)
  .commit();
