// Placeholder Mastra bootstrap. Will be implemented in later tasks.
export const initMastra = async () => {
  throw new Error('initMastra is not implemented yet.');
};

let mastraInstance: unknown;

export const getMastra = async () => {
  if (!mastraInstance) {
    mastraInstance = await initMastra();
  }

  return mastraInstance;
};
