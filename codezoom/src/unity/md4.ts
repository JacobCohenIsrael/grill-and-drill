// MD4 (RFC 1320), for one Unity convention: a MonoBehaviour whose script
// lives in a DLL is referenced by the DLL's GUID and a fileID made from the
// first four bytes of MD4("s\0\0\0" + namespace + class name).

export function md4(input: Uint8Array): Uint8Array {
  const n = input.length;
  const total = (((n + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(input);
  buf[n] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, (n * 8) >>> 0, true);
  view.setUint32(total - 4, Math.floor((n * 8) / 2 ** 32), true);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  const x = new Uint32Array(16);
  const rotl = (v: number, s: number) => (v << s) | (v >>> (32 - s));
  const f = (p: number, q: number, r: number) => (p & q) | (~p & r);
  const g = (p: number, q: number, r: number) => (p & q) | (p & r) | (q & r);
  const h = (p: number, q: number, r: number) => p ^ q ^ r;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) x[i] = view.getUint32(off + i * 4, true);
    const [aa, bb, cc, dd] = [a, b, c, d];
    for (const k of [0, 4, 8, 12]) {
      a = rotl((a + f(b, c, d) + x[k]) | 0, 3);
      d = rotl((d + f(a, b, c) + x[k + 1]) | 0, 7);
      c = rotl((c + f(d, a, b) + x[k + 2]) | 0, 11);
      b = rotl((b + f(c, d, a) + x[k + 3]) | 0, 19);
    }
    for (const k of [0, 1, 2, 3]) {
      a = rotl((a + g(b, c, d) + x[k] + 0x5a827999) | 0, 3);
      d = rotl((d + g(a, b, c) + x[k + 4] + 0x5a827999) | 0, 5);
      c = rotl((c + g(d, a, b) + x[k + 8] + 0x5a827999) | 0, 9);
      b = rotl((b + g(c, d, a) + x[k + 12] + 0x5a827999) | 0, 13);
    }
    for (const k of [0, 2, 1, 3]) {
      a = rotl((a + h(b, c, d) + x[k] + 0x6ed9eba1) | 0, 3);
      d = rotl((d + h(a, b, c) + x[k + 8] + 0x6ed9eba1) | 0, 9);
      c = rotl((c + h(d, a, b) + x[k + 4] + 0x6ed9eba1) | 0, 11);
      b = rotl((b + h(c, d, a) + x[k + 12] + 0x6ed9eba1) | 0, 15);
    }
    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a, b, c, d].forEach((v, i) => ov.setUint32(i * 4, v >>> 0, true));
  return out;
}

/** The fileID Unity gives a class in a DLL, as it appears in m_Script. */
export function dllScriptFileId(namespace: string, name: string): string {
  const digest = md4(new TextEncoder().encode(`s\0\0\0${namespace}${name}`));
  return String(new DataView(digest.buffer).getInt32(0, true));
}
