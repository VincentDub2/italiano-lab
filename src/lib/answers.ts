export const normalizeAnswer = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").toLocaleLowerCase('it').replace(/[òó]/g, 'o');
