import { App } from '@slack/bolt';

const requireEnv = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
};

export const initSlackApp = (): App => {
  const token = requireEnv(process.env.SLACK_BOT_TOKEN, 'SLACK_BOT_TOKEN');
  const signingSecret = requireEnv(process.env.SLACK_SIGNING_SECRET, 'SLACK_SIGNING_SECRET');
  const socketMode = process.env.SLACK_SOCKET_MODE === 'true';
  const appToken = socketMode
    ? requireEnv(process.env.SLACK_APP_TOKEN, 'SLACK_APP_TOKEN')
    : undefined;

  return new App({
    token,
    signingSecret,
    socketMode,
    appToken,
  });
};

export const startSlackApp = async (app: App): Promise<void> => {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.start(port);

  if (process.env.SLACK_SOCKET_MODE === 'true') {
    console.log('⚡️ Slack Bolt app is running in Socket Mode!');
  } else {
    console.log(`⚡️ Slack Bolt app is running on port ${port} (Events API)!`);
  }
};
