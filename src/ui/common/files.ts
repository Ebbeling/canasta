/**
 * The browser side of export and import.
 *
 * Blobs, object URLs and `FileReader` live here, at the edge, so the
 * application and domain layers keep working with plain text.
 */

/** Offers `text` to the user as a download. */
export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType = 'application/json',
): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers; a turn of
  // the event loop is enough and keeps the object from leaking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Reads a picked file as UTF-8 text.
 *
 * `Blob.text()` is the modern path, but it is missing in older Safari — and in
 * jsdom, which is why the tests exercise the fallback rather than the happy
 * path. `FileReader` works everywhere the app runs.
 */
export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Het bestand kon niet worden gelezen.'));
    reader.readAsText(file, 'UTF-8');
  });
}
