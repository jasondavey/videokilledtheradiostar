const PROFANITY_LIST = ['duck', 'ducks', 'damn', 'hell', 'trumpet'];

export function filterProfanity(text: string): string {
  if (typeof text !== 'string') return text;

  const censored = PROFANITY_LIST.reduce((acc, word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    return acc.replace(regex, '****');
  }, text);

  return censored;
}
