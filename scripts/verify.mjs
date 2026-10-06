// 用 build-index 產出的 idx/ 在本機核對句子，跟前端 verify 同邏輯，測試用
import fs from 'node:fs';
import * as OpenCC from 'opencc-js';
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
// 異體字折疊：不同版本用字不同（隣/鄰、鑪/爐、惟/唯…），兩邊都折成同一字才比得到。前端要用同一張表
const VARIANTS = '隣邻鄰邻鑪炉爐炉汙污沈沉裏里裡里嘆叹歎叹箇个綫线鬭斗鬥斗嚐尝甞尝牀床牕窗窓窗窻窗峯峰羣群迴回囘回煙烟鴈雁栢柏盃杯柸杯闇暗晻暗衹只祇只秖只秪只粧妆妝妆鏁锁恠怪蹤踪跡迹蹟迹著着於于喫吃凴凭憑凭卻却皁皂溼湿濕湿惟唯脣唇鵰雕彫雕凋雕糢模㬉暖煖暖讎仇讐仇疎疏踈疏遶绕繞绕酧酬醻酬竝并並并簷檐';
const VMAP = new Map(); for (let i = 0; i < VARIANTS.length; i += 2) VMAP.set(VARIANTS[i], VARIANTS[i + 1]);
const norm = s => [...t2s(String(s || '')).replace(/[^㐀-鿿豈-﫿]/g, '')].map(c => VMAP.get(c) || c).join('');
const fnv1a = s => { let h = 0x811c9dc5; for (const ch of s) { const c = ch.codePointAt(0); h ^= c & 0xff; h = Math.imul(h, 0x01000193); h ^= c >>> 8; h = Math.imul(h, 0x01000193); } return h >>> 0; };
const clauses = text => t2s(String(text || '')).split(/[，。？！；：、,.?!;:\s「」『』“”‘’（）()《》〈〉·—…\-\[\]]+/).map(norm).filter(c => c.length >= 3);
const lookup = h => { const b = fs.readFileSync(`idx/s/${(h >>> 20).toString(16).padStart(3, '0')}.bin`); const a = []; for (let i = 0; i < b.length; i += 6) if (b.readUInt32LE(i) === h) a.push(b.readUInt16LE(i + 4)); return a; };
const idiom = w => { const h = fnv1a(norm(w)); const b = fs.readFileSync(`idx/idiom/${(h >>> 24).toString(16).padStart(2, '0')}.bin`); for (let i = 0; i < b.length; i += 4) if (b.readUInt32LE(i) === h) return true; return false; };
export function verify(text, author) {
  if (norm(text).length <= 8 && idiom(text)) return 'idiom';
  const cs = clauses(text); if (!cs.length) return 'none';
  const ah = fnv1a(norm(author)) & 0xffff;
  let hit = 0, auth = 0;
  for (const c of cs) { const a = lookup(fnv1a(c)); if (a.length) hit++; if (a.includes(ah)) auth++; }
  return hit === cs.length ? (auth === cs.length ? 'match+author' : 'match') : hit ? `partial ${hit}/${cs.length}` : 'none';
}
if (process.argv[1].endsWith('verify.mjs')) for (const line of fs.readFileSync(0, 'utf8').trim().split('\n')) { const [t, a] = line.split('|'); console.log(verify(t, a).padEnd(14), t, a); }
