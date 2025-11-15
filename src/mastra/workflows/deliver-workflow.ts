import { createWorkflow } from '@mastra/core/workflows';

import { deliverStepOutputSchema, gatherStepOutputSchema } from './steps/schemas';
import { generateReportStep } from './steps/generate-report-step';

export const deliverWorkflow = createWorkflow({
  id: 'deliver-workflow',
  inputSchema: gatherStepOutputSchema,
  outputSchema: deliverStepOutputSchema,
})
  .then(generateReportStep)
  .commit();
