import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, inspectImage, processImageSafely, readBoundedBody, validateImage } from '../../apps/builder/src/lib/images';

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('bounded image intake', () => {
  it('sniffs supported formats and rejects SVG, MIME spoofing, and excessive dimensions', () => {
    expect(inspectImage(png(10, 10))).toMatchObject({ mime: 'image/png', width: 10, height: 10 });
    const jpeg = new Uint8Array([0xff,0xd8,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,0x00,0x01,0x03,0x01,0x11,0x00,0xff,0xd9]);
    expect(inspectImage(jpeg)).toMatchObject({ mime: 'image/jpeg', width: 1, height: 1 });
    const webp = new Uint8Array(30); webp.set([82,73,70,70], 0); webp.set([87,69,66,80], 8); webp.set([86,80,56,88], 12);
    expect(inspectImage(webp)).toMatchObject({ mime: 'image/webp', width: 1, height: 1 });
    expect(inspectImage(new TextEncoder().encode('<svg onload="alert(1)"/>'))).toBeNull();
    expect(() => validateImage(png(10, 10), 'image/jpeg', 'cleared', 'licensed fixture')).toThrow('mime');
    expect(() => validateImage(png(5000, 5000), 'image/png', 'cleared', 'licensed fixture')).toThrow('dimensions');
    expect(MAX_IMAGE_PIXELS).toBe(20_000_000);
  });

  it('checks rights independently and rejects dishonest content length using actual streamed bytes', async () => {
    expect(() => validateImage(png(1, 1), 'image/png', null, null)).toThrow('rights');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES)); controller.enqueue(new Uint8Array(2)); controller.close(); },
    });
    const request = new Request('http://127.0.0.1/upload', { method: 'POST', headers: { 'content-length': '1' }, body: stream, duplex: 'half' } as RequestInit);
    await expect(readBoundedBody(request)).rejects.toThrow('size');
  });

  it('does not pass input through when the Worker decoder and re-encoder are unproven', async () => {
    const bytes = png(1, 1);
    await expect(processImageSafely(null, bytes, { mime: 'image/png', width: 1, height: 1 })).rejects.toThrow('pipeline-unproven');
  });
});
