import { initDatabase } from './connection';
import { SlackMetadataRepository } from './repositories/slack-metadata-repository';

export { initDatabase };
export type { DatabaseConnections, SQLiteDb } from './connection';
export { SlackMetadataRepository } from './repositories/slack-metadata-repository';
export type { SlackMetadataCreateInput } from './repositories/slack-metadata-repository';

export const getSlackMetadataRepository = async (): Promise<SlackMetadataRepository> => {
  const { db } = await initDatabase();
  return new SlackMetadataRepository(db);
};
