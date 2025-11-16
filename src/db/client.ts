import { initDatabase } from './connection';
import { SlackMetadataRepository } from './repositories/slack-metadata-repository';
import { ResearchRunsRepository } from './repositories/research-runs-repository';
import { FeedbacksRepository } from './repositories/feedbacks-repository';

export { initDatabase };
export type { DatabaseConnections, SQLiteDb } from './connection';
export { SlackMetadataRepository } from './repositories/slack-metadata-repository';
export type { SlackMetadataCreateInput } from './repositories/slack-metadata-repository';
export { ResearchRunsRepository } from './repositories/research-runs-repository';
export type { ResearchRunCreateInput } from './repositories/research-runs-repository';
export { FeedbacksRepository } from './repositories/feedbacks-repository';
export type { FeedbackCreateInput } from './repositories/feedbacks-repository';

export const getSlackMetadataRepository = async (): Promise<SlackMetadataRepository> => {
  const { db } = await initDatabase();
  return new SlackMetadataRepository(db);
};

export const getResearchRunsRepository = async (): Promise<ResearchRunsRepository> => {
  const { db } = await initDatabase();
  return new ResearchRunsRepository(db);
};

export const getFeedbacksRepository = async (): Promise<FeedbacksRepository> => {
  const { db } = await initDatabase();
  return new FeedbacksRepository(db);
};
