// A minimal MP4 (ISO base media file) writer for one H.264 video track, as
// the demo video's encoder (WebCodecs, in the browser) gives it: samples in
// AVC format (each NAL unit preceded by its length), all the same length of
// time and in display order (no B-frames), with the decoder configuration
// record (avcC) of the first key frame. The index (moov) goes before the
// samples (mdat), so players can start before the whole file has arrived.

const u32 = (...values) => {
  const out = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => out.writeUInt32BE(v >>> 0, 4 * i));
  return out;
};
const u16 = (...values) => {
  const out = Buffer.alloc(2 * values.length);
  values.forEach((v, i) => out.writeUInt16BE(v & 0xffff, 2 * i));
  return out;
};

/** A box: its size, its four-letter type, then its contents. */
function box(type, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
}

/** A "full" box, which starts with a version and flags. */
const full = (type, version, flags, ...parts) => box(type, u32(((version & 0xff) << 24) | (flags & 0xffffff)), ...parts);

// The identity transformation, in the fixed-point form boxes give it.
const MATRIX = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);

/**
 * The MP4 file of `samples` ({ data: Buffer, key: boolean }), each lasting
 * `sampleDuration` units of `timescale` per second.
 */
export function mp4({ width, height, timescale, sampleDuration, description, samples }) {
  const duration = samples.length * sampleDuration;
  const keys = samples.flatMap((s, i) => (s.key ? [i + 1] : []));
  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(0x200), Buffer.from('isomiso2avc1mp41', 'latin1'));
  const moov = (offset) => box('moov',
    full('mvhd', 0, 0, u32(0, 0, timescale, duration, 0x00010000), u16(0x0100), Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(2)),
    box('trak',
      full('tkhd', 0, 3, u32(0, 0, 1, 0, duration), Buffer.alloc(8), u16(0, 0, 0, 0), MATRIX, u32(width * 0x10000, height * 0x10000)),
      box('mdia',
        full('mdhd', 0, 0, u32(0, 0, timescale, duration), u16(0x55c4, 0)), // language "und"
        full('hdlr', 0, 0, u32(0), Buffer.from('vide', 'latin1'), Buffer.alloc(12), Buffer.from('VideoHandler\0', 'latin1')),
        box('minf',
          full('vmhd', 0, 1, Buffer.alloc(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, u32(1), box('avc1',
              Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width, height),
              u32(0x00480000, 0x00480000, 0), u16(1), Buffer.alloc(32), u16(0x18, 0xffff),
              box('avcC', Buffer.from(description)))),
            full('stts', 0, 0, u32(1, samples.length, sampleDuration)),
            full('stss', 0, 0, u32(keys.length, ...keys)),
            full('stsc', 0, 0, u32(1, 1, samples.length, 1)),
            full('stsz', 0, 0, u32(0, samples.length, ...samples.map((s) => s.data.length))),
            full('stco', 0, 0, u32(1, offset)))))));
  // The samples start after the file type, the index and the mdat box's own header.
  const offset = ftyp.length + moov(0).length + 8;
  return Buffer.concat([ftyp, moov(offset), box('mdat', ...samples.map((s) => s.data))]);
}
