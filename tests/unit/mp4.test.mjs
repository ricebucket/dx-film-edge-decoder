import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mp4 } from '../../scripts/lib/mp4.mjs';

/** The boxes of `buf` from `start` to `end`: type, where its contents are, and their length. */
function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  for (let at = start; at < end;) {
    const size = buf.readUInt32BE(at);
    out.push({ type: buf.toString('latin1', at + 4, at + 8), body: at + 8, length: size - 8 });
    at += size;
  }
  return out;
}

/** The box at a path of types, such as ['moov', 'trak', 'mdia']. */
function find(buf, path) {
  let start = 0;
  let end = buf.length;
  let found = null;
  for (const type of path) {
    found = boxes(buf, start, end).find((b) => b.type === type);
    if (!found) return null;
    start = found.body;
    end = found.body + found.length;
  }
  return found;
}

describe('the MP4 writer of the demo video (scripts/lib/mp4.mjs)', () => {
  const samples = [
    { data: Buffer.from([0, 0, 0, 2, 0x65, 1]), key: true },
    { data: Buffer.from([0, 0, 0, 1, 0x41]), key: false },
    { data: Buffer.from([0, 0, 0, 3, 0x65, 2, 3]), key: true },
  ];
  const file = mp4({ width: 1120, height: 1680, timescale: 1000, sampleDuration: 40, description: Buffer.from([1, 0x64, 0, 0x28]), samples });

  test('puts the index before the samples, as one sample table for one video track', () => {
    assert.deepEqual(boxes(file).map((b) => b.type), ['ftyp', 'moov', 'mdat']);
    assert.ok(find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd']));
    assert.equal(file.toString('latin1', find(file, ['moov', 'trak', 'mdia', 'hdlr']).body + 8, find(file, ['moov', 'trak', 'mdia', 'hdlr']).body + 12), 'vide');
  });

  test('gives the frame size, the duration and the key frames', () => {
    const tkhd = find(file, ['moov', 'trak', 'tkhd']);
    assert.equal(file.readUInt32BE(tkhd.body + tkhd.length - 8) / 0x10000, 1120);
    assert.equal(file.readUInt32BE(tkhd.body + tkhd.length - 4) / 0x10000, 1680);
    const mvhd = find(file, ['moov', 'mvhd']);
    assert.equal(file.readUInt32BE(mvhd.body + 12), 1000); // timescale
    assert.equal(file.readUInt32BE(mvhd.body + 16), 120); // 3 × 40 ms
    const stss = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stss']);
    assert.deepEqual([1, 2].map((i) => file.readUInt32BE(stss.body + 4 + 4 * i)), [1, 3]);
  });

  test('points the sample table at each sample\'s bytes', () => {
    const stbl = ['moov', 'trak', 'mdia', 'minf', 'stbl'];
    const stco = find(file, [...stbl, 'stco']);
    const stsz = find(file, [...stbl, 'stsz']);
    let at = file.readUInt32BE(stco.body + 8);
    samples.forEach((s, i) => {
      const size = file.readUInt32BE(stsz.body + 12 + 4 * i);
      assert.deepEqual(file.subarray(at, at + size), s.data);
      at += size;
    });
    assert.equal(at, file.length);
  });
});
