import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { OtelExporter } from '@mastra/otel-exporter';
import { DefaultExporter } from '@mastra/core/ai-tracing';

import { initDatabase } from '../db/client';
import { reportAgent } from './agents/report-agent';
import { researchAgent } from './agents/research-agent';
import { mainWorkflow } from './workflows/main-workflow';

let mastraInstance: Mastra | null = null;

const createMastra = async () => {
  const { client } = await initDatabase();
  const storage = new LibSQLStore({ client });

  // LangWatch observability configuration
  const langwatchEnabled = process.env.LANGWATCH_ENABLED === 'true';
  const langwatchApiKey = process.env.LANGWATCH_API_KEY;
  const langwatchEndpoint = process.env.LANGWATCH_ENDPOINT;

  return new Mastra({
    storage,
    logger: new PinoLogger({ name: 'mastra-slack-hitl', level: 'info' }),
    agents: {
      'research-agent': researchAgent,
      'report-agent': reportAgent,
    },
    workflows: {
      'slack-research-hitl': mainWorkflow,
    },
    observability:
      langwatchEnabled && langwatchApiKey && langwatchEndpoint
        ? {
            configs: {
              otel: {
                serviceName: 'mastra-slack-hitl',
                exporters: [
                  new OtelExporter({
                    provider: {
                      custom: {
                        endpoint: `${langwatchEndpoint}/api/otel/v1/traces`,
                        protocol: 'http/json',
                        headers: {
                          Authorization: `Bearer ${langwatchApiKey}`,
                        },
                      },
                    },
                  }),
                  new DefaultExporter(), // Studio でもトレースを表示
                ],
              },
            },
          }
        : {
            default: {
              enabled: true,
            },
          },
  });
};

export const initMastra = async () => {
  mastraInstance ??= await createMastra();

  return mastraInstance;
};

export const mastra = await initMastra();

export const getMastra = async () => mastra;
