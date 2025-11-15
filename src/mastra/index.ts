import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

import { initDatabase } from '../db/client';
import { reportAgent } from './agents/report-agent';
import { researchAgent } from './agents/research-agent';
import { mainWorkflow } from './workflows/main-workflow';

let mastraInstance: Mastra | null = null;

const createMastra = async () => {
  const { client } = await initDatabase();
  const storage = new LibSQLStore({ client });

  return new Mastra({
    storage,
    agents: {
      'research-agent': researchAgent,
      'report-agent': reportAgent,
    },
    workflows: {
      'slack-research-hitl': mainWorkflow,
    },
    observability: {
      default: {
        enabled: true,
      },
    },
  });
};

export const initMastra = async () => {
  if (!mastraInstance) {
    mastraInstance = await createMastra();
  }

  return mastraInstance;
};

export const mastra = await initMastra();

export const getMastra = async () => mastra;
