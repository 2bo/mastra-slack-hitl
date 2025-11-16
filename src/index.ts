import 'dotenv/config';

import { initMastra } from './mastra';
import { logger } from './logger';
import { startDeadlineChecker } from './jobs/deadline-checker';
import { initSlackApp, startSlackApp } from './slack/bolt-app';
import {
  handleApproveAction,
  handleRejectAction,
  handleFeedbackAction,
} from './slack/handlers/action-handler';
import { handleResearchCommand } from './slack/handlers/command-handler';

const registerProcessErrorHandlers = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled Rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught Exception');
    process.exit(1);
  });
};

const registerSlackHandlers = () => {
  const app = initSlackApp();
  app.command('/research', handleResearchCommand);
  app.action('approve', handleApproveAction);
  app.action('reject', handleRejectAction);
  app.action('research_feedback', handleFeedbackAction);
  return app;
};

async function main() {
  logger.info('Starting Mastra Slack HITL application...');
  await initMastra();
  const app = registerSlackHandlers();

  await startSlackApp(app);
  startDeadlineChecker(app.client);

  logger.info('✅ Application started successfully');
}

registerProcessErrorHandlers();

main().catch((error) => {
  logger.fatal({ error }, 'Failed to bootstrap application');
  process.exit(1);
});
