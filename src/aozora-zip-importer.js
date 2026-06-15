const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function decodeAscii(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

function findEndOfCentralDirectory(view) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('ZIP end of central directory was not found.');
}

function ensureSupportedArchive(entryCount, centralDirectoryOffset, centralDirectorySize) {
  if (entryCount !== 1) {
    throw new Error('Only single-file Aozora ZIP archives are supported.');
  }

  if (centralDirectoryOffset === 0xffffffff || centralDirectorySize === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported.');
  }
}

async function inflateRaw(bytes) {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error('DecompressionStream is not available in this browser.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseCentralDirectoryEntry(buffer, view, offset) {
  if (readUint32(view, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
    throw new Error('Invalid ZIP central directory entry.');
  }

  const compressionMethod = readUint16(view, offset + 10);
  const compressedSize = readUint32(view, offset + 20);
  const uncompressedSize = readUint32(view, offset + 24);
  const fileNameLength = readUint16(view, offset + 28);
  const extraFieldLength = readUint16(view, offset + 30);
  const commentLength = readUint16(view, offset + 32);
  const localHeaderOffset = readUint32(view, offset + 42);
  const fileNameOffset = offset + 46;
  const fileNameBytes = new Uint8Array(buffer, fileNameOffset, fileNameLength);
  const fileName = decodeAscii(fileNameBytes);

  return {
    compressionMethod,
    compressedSize,
    uncompressedSize,
    fileName,
    nextOffset: fileNameOffset + fileNameLength + extraFieldLength + commentLength,
    localHeaderOffset
  };
}

function extractStoredData(buffer, view, entry) {
  const localOffset = entry.localHeaderOffset;
  if (readUint32(view, localOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error('Invalid ZIP local file header.');
  }

  const fileNameLength = readUint16(view, localOffset + 26);
  const extraFieldLength = readUint16(view, localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraFieldLength;
  return new Uint8Array(buffer.slice(dataOffset, dataOffset + entry.compressedSize));
}

async function extractSingleFileFromZip(arrayBuffer, options = {}) {
  const view = new DataView(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectorySize = readUint32(view, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const extension = String(options.extension ?? '').toLowerCase();

  ensureSupportedArchive(entryCount, centralDirectoryOffset, centralDirectorySize);

  const entry = parseCentralDirectoryEntry(arrayBuffer, view, centralDirectoryOffset);
  if (!extension || !entry.fileName.toLowerCase().endsWith(extension)) {
    throw new Error(`The ZIP archive does not contain a ${extension || 'supported'} file.`);
  }

  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
  }

  const compressedBytes = extractStoredData(arrayBuffer, view, entry);
  const fileBytes = entry.compressionMethod === 0
    ? compressedBytes
    : await inflateRaw(compressedBytes);

  if (entry.uncompressedSize !== 0 && fileBytes.byteLength !== entry.uncompressedSize) {
    throw new Error('The extracted text size does not match the ZIP metadata.');
  }

  return {
    fileName: entry.fileName,
    bytes: fileBytes
  };
}

export async function extractAozoraTxtFromZip(arrayBuffer) {
  return extractSingleFileFromZip(arrayBuffer, { extension: '.txt' });
}

export async function extractAozoraCsvFromZip(arrayBuffer) {
  return extractSingleFileFromZip(arrayBuffer, { extension: '.csv' });
}
