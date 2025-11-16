export interface SlackChatStreamClient {
  postEphemeral(params: { channel: string; user: string; text: string }): Promise<void>;
  postMessage(params: {
    channel: string;
    thread_ts?: string;
    text: string;
    blocks?: unknown;
  }): Promise<{ ts?: string }>;
  update(params: { channel: string; ts: string; text?: string; blocks?: unknown }): Promise<void>;
  startStream(params: {
    channel: string;
    thread_ts: string;
    markdown_text?: string;
    recipient_team_id?: string;
    recipient_user_id?: string;
  }): Promise<{ ts?: string }>;
  appendStream(params: { channel: string; ts: string; markdown_text: string }): Promise<void>;
  stopStream(params: {
    channel: string;
    ts: string;
    markdown_text?: string;
    blocks?: unknown;
  }): Promise<void>;
}

export interface SlackClientWithChat {
  chat: unknown;
}

export const getChatStreamClient = (client: SlackClientWithChat): SlackChatStreamClient => {
  const chatApi = (client as { chat: unknown }).chat;
  return chatApi as SlackChatStreamClient;
};
