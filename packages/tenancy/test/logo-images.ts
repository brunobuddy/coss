/** A PNG header (signature + IHDR) of the given size: enough to sniff and measure. */
export function png(width: number, height: number): Buffer {
  const body = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body, 0);
  body.write("IHDR", 12, "latin1");
  body.writeUInt32BE(width, 16);
  body.writeUInt32BE(height, 20);
  return body;
}
