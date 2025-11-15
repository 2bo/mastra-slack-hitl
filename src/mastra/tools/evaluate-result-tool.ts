import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const verdictSchema = z.enum(['reliable', 'plausible', 'needs-corroboration']);

const inputSchema = z.object({
  finding: z
    .string()
    .min(20, 'finding should include enough context for evaluation.')
    .describe('Statement or claim extracted from a source.'),
  sourceUrl: z.string().url().describe('URL of the source that produced the finding.'),
  query: z.string().min(5, 'query context is required.').describe('Original research query.'),
  criteria: z
    .string()
    .optional()
    .describe('Optional rubric such as recency, methodology quality, or bias.'),
});

const outputSchema = z.object({
  verdict: verdictSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const TRUSTED_DOMAINS = [
  'nytimes.com',
  'wsj.com',
  'ft.com',
  'economist.com',
  'nature.com',
  'science.org',
  'who.int',
  'un.org',
  'nasa.gov',
];

type Verdict = z.infer<typeof verdictSchema>;
const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 4),
  );

const scoreOverlap = (finding: string, query: string): number => {
  const findingTokens = tokenize(finding);
  const queryTokens = tokenize(query);
  if (findingTokens.size === 0 || queryTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (findingTokens.has(token)) {
      overlap += 1;
    }
  }

  return Math.min(overlap / Math.min(findingTokens.size, queryTokens.size), 1);
};

const classifyVerdict = (score: number): Verdict => {
  if (score >= 0.75) {
    return 'reliable';
  }
  if (score >= 0.45) {
    return 'plausible';
  }
  return 'needs-corroboration';
};

const describeHost = (host: string): string => {
  if (host.endsWith('.gov')) {
    return 'government domain';
  }
  if (host.endsWith('.edu')) {
    return 'academic domain';
  }
  if (TRUSTED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return 'well-known institution';
  }
  return 'public domain';
};

export const evaluateResultTool = createTool({
  id: 'evaluate-result',
  description: 'Assess the credibility and relevance of a finding compared to the research query.',
  inputSchema,
  outputSchema,
  execute: async (toolContext) => {
    const payload = toolContext.context;
    const url = new URL(payload.sourceUrl);
    const isHttps = url.protocol === 'https:';

    let score = 0.35;
    if (isHttps) {
      score += 0.15;
    }

    if (url.hostname.endsWith('.gov') || url.hostname.endsWith('.edu')) {
      score += 0.25;
    } else if (
      TRUSTED_DOMAINS.some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    ) {
      score += 0.2;
    }

    const overlapScore = scoreOverlap(payload.finding, payload.query);
    score += 0.25 * overlapScore;

    if (
      payload.criteria?.toLowerCase().includes('recency') &&
      /\b20(1[5-9]|2[0-9])\b/.test(payload.finding)
    ) {
      score += 0.05;
    }

    const normalizedScore = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    const verdict = classifyVerdict(normalizedScore);

    const rationaleParts = [
      `host ${url.hostname} (${describeHost(url.hostname)})`,
      isHttps ? 'served over HTTPS' : 'served over HTTP',
      `query overlap ${overlapScore.toFixed(2)}`,
    ];

    if (payload.criteria) {
      rationaleParts.push(`criteria: ${payload.criteria}`);
    }

    return {
      verdict,
      confidence: normalizedScore,
      rationale: rationaleParts.join('; '),
    };
  },
});
