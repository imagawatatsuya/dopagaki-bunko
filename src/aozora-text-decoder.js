function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  throw new Error('decodeAozoraText requires an ArrayBuffer or Uint8Array.');
}

function decodeWithLabel(bytes, label) {
  const decoder = new TextDecoder(label, { fatal: true });
  return decoder.decode(bytes);
}

export function decodeShiftJis(buffer) {
  return decodeWithLabel(toUint8Array(buffer), 'shift_jis');
}

export function decodeUtf8(buffer) {
  return decodeWithLabel(toUint8Array(buffer), 'utf-8');
}

export function decodeAozoraText(buffer) {
  const bytes = toUint8Array(buffer);

  try {
    return {
      encoding: 'shift_jis',
      text: decodeWithLabel(bytes, 'shift_jis')
    };
  } catch (shiftJisError) {
    try {
      return {
        encoding: 'utf-8',
        text: decodeWithLabel(bytes, 'utf-8')
      };
    } catch (utf8Error) {
      throw new Error(
        `Failed to decode text as Shift_JIS or UTF-8: ${shiftJisError.message}; ${utf8Error.message}`
      );
    }
  }
}
