import * as fs from 'node:fs';

/**
 * Reads text from disk with encoding autodetection.
 * Windows editors often save JSON as UTF-16 LE; reading those as UTF-8 yields mojibake and JSON.parse fails.
 * Also strips UTF-8 BOM when present.
 */
export function readTextFileAutodetect(filePath: string): string {
  const buf = fs.readFileSync(filePath);

  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '');
  }

  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = buf.subarray(2);
    const swapped = Buffer.alloc(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1]!;
      swapped[i + 1] = body[i]!;
    }
    return swapped.toString('utf16le').replace(/^\uFEFF/, '');
  }

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8');
  }

  return buf.toString('utf8');
}
