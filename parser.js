export const MAX_LINE_NUMBER = 1_000_000;

/**
 * Inclusive subtitle line calculation.
 * Examples: (1, 52) => 52 | (131, 195) => 65 | (96, 40) => 57
 */
export function calculateInclusiveLines(start, end) {
  return Math.abs(end - start) + 1;
}

/**
 * Clean Title Case formatter that preserves short uppercase codes (e.g., OVA, II).
 */
export function formatTitleCase(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (/^[A-Z0-9]{2,5}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Formats an episode token consistently (e.g., "ep7" => "Ep7", "e7" => "E7", "ep 7" => "Ep7").
 */
export function formatEpisodeToken(rawEpisode) {
  if (!rawEpisode) return '';
  const compact = rawEpisode.trim().replace(/\s+/g, '');
  return compact.charAt(0).toUpperCase() + compact.slice(1).toLowerCase();
}

/**
 * Builds a canonical duplicate key for comparison.
 */
export function buildDuplicateKey(record) {
  return [
    record.project_name.trim().toLowerCase(),
    (record.episode || '').trim().toLowerCase(),
    Number(record.start_line),
    Number(record.end_line)
  ].join('|');
}

/**
 * Formats a single record for display, clipboard copy, and TXT export.
 * Example: "Tank Chair Ep7 (1-52) = 52"
 */
export function formatRecordLine(record) {
  const titlePart = record.episode
    ? `${record.project_name} ${record.episode}`
    : record.project_name;
  return `${titlePart} (${record.start_line}-${record.end_line}) = ${record.total_lines}`;
}

/**
 * Validates individual fields (used by both batch parser and Edit modal).
 */
export function validateRecordFields({ projectName, episode = '', startLine, endLine }) {
  const cleanName = projectName.trim();
  if (!cleanName) {
    return { valid: false, error: 'Project or movie name is required.' };
  }

  if (cleanName.length > 120) {
    return { valid: false, error: 'Project name is too long (max 120 characters).' };
  }

  const start = Number(startLine);
  const end = Number(endLine);

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { valid: false, error: 'Start and end lines must be whole numbers.' };
  }

  if (start < 1 || end < 1) {
    return { valid: false, error: 'Line numbers must be positive integers (1 or greater).' };
  }

  if (start > MAX_LINE_NUMBER || end > MAX_LINE_NUMBER) {
    return {
      valid: false,
      error: `Line numbers cannot exceed ${MAX_LINE_NUMBER.toLocaleString()}.`
    };
  }

  return {
    valid: true,
    record: {
      project_name: cleanName,
      episode: episode.trim(),
      start_line: start,
      end_line: end,
      total_lines: calculateInclusiveLines(start, end)
    }
  };
}

/**
 * Parses a single comma-separated entry such as:
 * "Tank Chair Ep7 1-52" or "full clearing e7 131-195" or "Spirited Away 96-40"
 */
export function parseSingleEntry(rawEntry) {
  const entry = rawEntry.trim();
  if (!entry) {
    return { valid: false, error: 'Empty entry detected between commas.' };
  }

  // Catch negative ranges explicitly for a clear user message
  if (/(?:^|\s)-\d+\s*[-–—]\s*-?\d+$/.test(entry) || /\d+\s*[-–—]\s*-\d+$/.test(entry)) {
    return { valid: false, error: `"${entry}" — Negative line numbers are not supported.` };
  }

  // Match the trailing numeric range (supports -, –, or — with optional spaces)
  const rangeMatch = entry.match(/^(.*?)\s+(\d+)\s*[-–—]\s*(\d+)$/);
  if (!rangeMatch) {
    if (/^\d+\s*[-–—]\s*\d+$/.test(entry)) {
      return { valid: false, error: `"${entry}" — Missing movie or project name before the range.` };
    }
    return {
      valid: false,
      error: `"${entry}" — Invalid format. Use "Project Name [Ep#] Start-End" (e.g. Tank Chair Ep7 1-52).`
    };
  }

  let titleAndEp = rangeMatch[1].trim();
  const startRaw = rangeMatch[2];
  const endRaw = rangeMatch[3];

  if (!titleAndEp) {
    return { valid: false, error: `"${entry}" — Missing movie or project name.` };
  }

  // Check for excessively large numbers before casting
  if (startRaw.length > 9 || endRaw.length > 9) {
    return {
      valid: false,
      error: `"${entry}" — Line numbers are too large (max ${MAX_LINE_NUMBER.toLocaleString()}).`
    };
  }

  // Extract optional trailing episode/chapter token (e.g. Ep7, Ep 7, Episode 7, E7, S1E7, Ch12)
  let episode = '';
  const epRegex = /\s+((?:s\d+\s*e\d+)|(?:(?:episode|ep|e|ch|chapter)\.?\s*\d+))$/i;
  const epMatch = titleAndEp.match(epRegex);

  if (epMatch) {
    episode = formatEpisodeToken(epMatch[1].replace(/\./g, ''));
    titleAndEp = titleAndEp.slice(0, epMatch.index).trim();
  }

  if (!titleAndEp) {
    return {
      valid: false,
      error: `"${entry}" — Missing movie or project name before "${episode}".`
    };
  }

  const projectName = formatTitleCase(titleAndEp);
  const validation = validateRecordFields({
    projectName,
    episode,
    startLine: Number(startRaw),
    endLine: Number(endRaw)
  });

  if (!validation.valid) {
    return { valid: false, error: `"${entry}" — ${validation.error}` };
  }

  return validation;
}

/**
 * Parses a full comma-separated input string and checks for duplicates
 * against both existing records and within the same batch.
 */
export function parseBatchInput(inputString, existingRecords = []) {
  const trimmed = inputString.trim();
  if (!trimmed) {
    return {
      validRecords: [],
      errors: ['Please enter at least one subtitle record (e.g. Tank Chair Ep7 1-52).']
    };
  }

  const parts = trimmed.split(',').filter((part, idx, arr) => {
    // Allow trailing comma gracefully, flag empty middle entries
    if (idx === arr.length - 1 && part.trim() === '') return false;
    return true;
  });

  if (parts.length === 0) {
    return {
      validRecords: [],
      errors: ['Please enter at least one subtitle record.']
    };
  }

  const existingKeys = new Set(existingRecords.map(buildDuplicateKey));
  const batchKeys = new Set();
  const validRecords = [];
  const errors = [];

  for (const part of parts) {
    const result = parseSingleEntry(part);
    if (!result.valid) {
      errors.push(result.error);
      continue;
    }

    const key = buildDuplicateKey(result.record);
    if (existingKeys.has(key)) {
      errors.push(`Duplicate skipped: "${formatRecordLine(result.record)}" already exists.`);
      continue;
    }
    if (batchKeys.has(key)) {
      errors.push(`Duplicate in input: "${formatRecordLine(result.record)}" was entered twice.`);
      continue;
    }

    batchKeys.add(key);
    validRecords.push(result.record);
  }

  return { validRecords, errors };
}