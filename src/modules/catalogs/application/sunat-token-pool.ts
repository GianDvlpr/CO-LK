type SunatTokenEnvironment = {
  SUNAT_RUC_API_TOKEN?: string;
  SUNAT_RUC_API_TOKEN_1?: string;
  SUNAT_RUC_API_TOKEN_2?: string;
};

function normalizedTokens(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function configuredSunatApiTokens(env: SunatTokenEnvironment) {
  const pool = normalizedTokens([env.SUNAT_RUC_API_TOKEN_1, env.SUNAT_RUC_API_TOKEN_2]);
  return pool.length ? pool : normalizedTokens([env.SUNAT_RUC_API_TOKEN]);
}

export function randomizedSunatApiTokens(tokens: string[], random: () => number = Math.random) {
  if (tokens.length < 2) return [...tokens];
  const firstIndex = Math.min(tokens.length - 1, Math.max(0, Math.floor(random() * tokens.length)));
  return [tokens[firstIndex], ...tokens.filter((_, index) => index !== firstIndex)];
}
