export function readFileAsArrayBuffer(file) {
  if (!(file instanceof Blob)) {
    throw new Error('readFileAsArrayBuffer requires a File or Blob.');
  }

  return file.arrayBuffer();
}
