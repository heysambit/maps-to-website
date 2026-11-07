export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_PROJECT_IMAGES = 10;
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ImageInfo = { mime: ImageMime; width: number; height: number };

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR') {
    const data = view(bytes); return { mime: 'image/png', width: data.getUint32(16), height: data.getUint32(20) };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { mime: 'image/webp', width, height };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { mime: 'image/webp', width: view(bytes).getUint16(26, true) & 0x3fff, height: view(bytes).getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
      return { mime: 'image/webp', width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) };
    }
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view(bytes).getUint16(offset); if (length < 2 || offset + length > bytes.length) return null;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return { mime: 'image/jpeg', height: view(bytes).getUint16(offset + 3), width: view(bytes).getUint16(offset + 5) };
      }
      offset += length;
    }
  }
  return null;
}

export async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_IMAGE_BYTES)) throw new Error('size');
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('empty');
  const output = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export function validateImage(bytes: Uint8Array, declaredMime: string | null, rightsStatus: string | null, rightsBasis: string | null): ImageInfo {
  const info = inspectImage(bytes);
  if (!info || info.mime !== declaredMime) throw new Error('mime');
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1 || info.width * info.height > MAX_IMAGE_PIXELS) throw new Error('dimensions');
  if (rightsStatus !== 'cleared' || !rightsBasis?.trim() || rightsBasis.length > 500) throw new Error('rights');
  return info;
}

export interface WorkerImageProcessor {
  process(bytes: Uint8Array, info: ImageInfo): Promise<{ bytes: Uint8Array; mime: ImageMime; width: number; height: number }>;
}

export async function processImageSafely(processor: WorkerImageProcessor | null, bytes: Uint8Array, info: ImageInfo) {
  if (!processor) throw new Error('pipeline-unproven');
  const output = await processor.process(bytes, info);
  if (output.bytes.length > MAX_IMAGE_BYTES || output.width < 1 || output.height < 1 || output.width * output.height > MAX_IMAGE_PIXELS) throw new Error('processed-invalid');
  const verified = inspectImage(output.bytes);
  if (!verified || verified.mime !== output.mime || verified.width !== output.width || verified.height !== output.height) throw new Error('processed-invalid');
  return output;
}
