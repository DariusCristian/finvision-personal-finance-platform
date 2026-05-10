const CSV_SPECIAL_CHARS_RE = /[",\r\n]/;

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = String(value);

  if (!CSV_SPECIAL_CHARS_RE.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
};

export const toCSV = ({ headers, rows }) => {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  const headerLine = safeHeaders.map((header) => escapeCsvValue(header)).join(',');
  const lines = safeRows.map((row) =>
    safeHeaders.map((header) => escapeCsvValue(row?.[header])).join(','));

  return [headerLine, ...lines].join('\n');
};

const sanitizeFilename = (filename) => String(filename || 'export.csv').replace(/[\r\n"]/g, '');

export const setCsvDownloadHeaders = (res, filename) => {
  const safeFilename = sanitizeFilename(filename);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
};

