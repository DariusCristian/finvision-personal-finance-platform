const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export const escapeRegex = (value) => String(value).replace(REGEX_SPECIAL_CHARACTERS, '\\$&');

export const buildLiteralSearchRegex = (value) => new RegExp(escapeRegex(value), 'i');
