import sharp from "sharp";
export async function imageFixture() {
  return sharp({
    create: { width: 240, height: 160, channels: 3, background: "#2476cf" },
  })
    .png()
    .toBuffer();
}
export function audioFixture(seconds = 1) {
  const samples = Math.floor(seconds * 16000);
  const result = Buffer.alloc(44 + samples * 2);
  result.write("RIFF");
  result.writeUInt32LE(36 + samples * 2, 4);
  result.write("WAVE", 8);
  result.write("fmt ", 12);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(16000, 24);
  result.writeUInt32LE(32000, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    result.writeInt16LE(
      Math.round(4000 * Math.sin((2 * Math.PI * 440 * i) / 16000)),
      44 + i * 2,
    );
  return result;
}
