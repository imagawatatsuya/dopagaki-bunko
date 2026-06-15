function normalizeLineBreaks(text) {
  return String(text ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCsvRow(text, startIndex) {
  const values = [];
  let current = '';
  let index = startIndex;
  let inQuotes = false;

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          current += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      values.push(current);
      current = '';
      index += 1;
      continue;
    }

    if (char === '\n') {
      values.push(current);
      return {
        values,
        nextIndex: index + 1
      };
    }

    current += char;
    index += 1;
  }

  values.push(current);
  return {
    values,
    nextIndex: index
  };
}

export function parseCsv(text) {
  const source = stripBom(normalizeLineBreaks(text));
  const rows = [];
  let index = 0;

  while (index < source.length) {
    const row = parseCsvRow(source, index);
    index = row.nextIndex;

    if (row.values.length === 1 && row.values[0] === '') {
      continue;
    }

    rows.push(row.values);
  }

  return rows;
}

export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }

  const [header, ...body] = rows;
  return body.map((row) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}
