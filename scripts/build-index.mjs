// 從 chinese-poetry 與 chinese-xinhua 建原文核對索引，輸出到 idx/
// 用法：node scripts/build-index.mjs <chinese-poetry 目錄> <idiom.json 路徑>
//
// 索引格式：每個「句子」（以標點切開、轉簡體、只留漢字）算 32-bit FNV-1a，
// 依雜湊最高 12 bits 分到 4096 個分片 idx/s/XXX.bin；每筆 6 bytes = u32 句雜湊 + u16 作者雜湊。
// 成語另存 idx/idiom/XX.bin（u32，依最高 8 bits 分 256 片）。
// 前端用同一套 normalize + fnv1a（見 index.html 的 verify 區塊）。
import fs from 'node:fs';
import path from 'node:path';
import * as OpenCC from 'opencc-js';

const [CP, IDIOM] = process.argv.slice(2);
if (!CP || !IDIOM) { console.error('usage: build-index.mjs <chinese-poetry dir> <idiom.json>'); process.exit(1); }

const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
// 異體字折疊：不同版本用字不同（隣/鄰、鑪/爐、惟/唯…），兩邊都折成同一字才比得到。前端要用同一張表
const VARIANTS = '隣邻鄰邻鑪炉爐炉汙污沈沉裏里裡里嘆叹歎叹箇个綫线鬭斗鬥斗嚐尝甞尝牀床牕窗窓窗窻窗峯峰羣群迴回囘回煙烟鴈雁栢柏盃杯柸杯闇暗晻暗衹只祇只秖只秪只粧妆妝妆鏁锁恠怪蹤踪跡迹蹟迹著着於于喫吃凴凭憑凭卻却皁皂溼湿濕湿惟唯脣唇鵰雕彫雕凋雕糢模㬉暖煖暖讎仇讐仇疎疏踈疏遶绕繞绕酧酬醻酬竝并並并簷檐';
const VMAP = new Map(); for (let i = 0; i < VARIANTS.length; i += 2) VMAP.set(VARIANTS[i], VARIANTS[i + 1]);
const norm = s => [...t2s(String(s || '')).replace(/[^㐀-鿿豈-﫿]/g, '')].map(c => VMAP.get(c) || c).join('');
const fnv1a = s => { let h = 0x811c9dc5; for (const ch of s) { const c = ch.codePointAt(0); h ^= c & 0xff; h = Math.imul(h, 0x01000193); h ^= c >>> 8; h = Math.imul(h, 0x01000193); } return h >>> 0; };
const clauses = text => t2s(String(text || '')).split(/[，。？！；：、,.?!;:\s「」『』“”‘’（）()《》〈〉·—…\-\[\]]+/).map(norm).filter(c => c.length >= 3);

const out = path.resolve('idx');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 's'), { recursive: true });
fs.mkdirSync(path.join(out, 'idiom'), { recursive: true });

const seen = new Set();
const shards = Array.from({ length: 4096 }, () => []);
let docs = 0;
function add(author, lines) {
  docs++;
  const ah = fnv1a(norm(author)) & 0xffff;
  for (const line of [].concat(lines || [])) for (const c of clauses(line)) {
    const h = fnv1a(c), key = h * 65536 + ah;
    if (seen.has(key)) continue;
    seen.add(key);
    shards[h >>> 20].push([h, ah]);
  }
}
const read = f => JSON.parse(fs.readFileSync(path.join(CP, f), 'utf8'));
const each = (f, fn) => { const d = read(f); (Array.isArray(d) ? d : [d]).forEach(fn); };

// 唐詩、宋詩（全唐诗目錄的 poet.song.* 其實是全宋詩）
for (const f of fs.readdirSync(path.join(CP, '全唐诗')).filter(f => /^poet\.(tang|song)\.\d+\.json$/.test(f) || f === '唐诗补录.json'))
  each('全唐诗/' + f, p => add(p.author, p.paragraphs));
for (const f of fs.readdirSync(path.join(CP, '宋词')).filter(f => /^ci\.song\.\d+\.json$/.test(f)))
  each('宋词/' + f, p => add(p.author, p.paragraphs));
for (const f of fs.readdirSync(path.join(CP, '五代诗词/huajianji')).filter(f => /-juan\.json$/.test(f)))
  each('五代诗词/huajianji/' + f, p => add(p.author, p.paragraphs));
each('五代诗词/nantang/poetrys.json', p => add(p.author, p.paragraphs));
each('元曲/yuanqu.json', p => add(p.author, p.paragraphs));
each('诗经/shijing.json', p => add('', p.content));
for (const f of fs.readdirSync(path.join(CP, '楚辞')).filter(f => f.endsWith('.json'))) each('楚辞/' + f, p => add(p.author, p.content));
each('论语/lunyu.json', p => add('孔子', p.paragraphs));
for (const f of ['mengzi', 'daxue', 'zhongyong']) each(`四书五经/${f}.json`, p => add(f === 'mengzi' ? '孟子' : '', p.paragraphs));
for (const f of fs.readdirSync(path.join(CP, '纳兰性德')).filter(f => f.endsWith('.json'))) each('纳兰性德/' + f, p => add(p.author || '纳兰性德', p.para || p.paragraphs));
for (const f of fs.readdirSync(path.join(CP, '曹操诗集')).filter(f => f.endsWith('.json'))) each('曹操诗集/' + f, p => add('曹操', p.paragraphs));
// 古文觀止：結構是 { content: [{ title, content: [{ chapter, paragraphs, author }] }] }
{
  const g = read('蒙学/guwenguanzhi.json');
  for (const sec of g.content || []) for (const art of sec.content || []) add(String(art.author || '').split('：').pop(), art.paragraphs);
}

// 通行選本：課本與 AI 引用多半是這些版本，跟全唐詩字句常有出入（例：靜夜思「床前明月光」）
function walk(node, author = '') {
  if (Array.isArray(node)) return node.forEach(n => walk(n, author));
  if (!node || typeof node !== 'object') return;
  const a = String(node.author || author).replace(/^[（(][^）)]*[）)]/, '').split('：').pop().trim();
  if (Array.isArray(node.paragraphs)) add(a, node.paragraphs);
  for (const k of ['content', 'contents']) if (node[k]) walk(node[k], a);
}
for (const f of ['全唐诗/唐诗三百首.json', '蒙学/tangshisanbaishou.json', '蒙学/qianjiashi.json', '宋词/宋词三百首.json', '水墨唐诗/shuimotangshi.json']) walk(read(f));

let total = 0;
shards.forEach((arr, i) => {
  arr.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const buf = Buffer.alloc(arr.length * 6);
  arr.forEach(([h, a], j) => { buf.writeUInt32LE(h, j * 6); buf.writeUInt16LE(a, j * 6 + 4); });
  fs.writeFileSync(path.join(out, 's', i.toString(16).padStart(3, '0') + '.bin'), buf);
  total += arr.length;
});

const idioms = Array.from({ length: 256 }, () => new Set());
for (const it of JSON.parse(fs.readFileSync(IDIOM, 'utf8'))) {
  const w = norm(it.word);
  if (w.length >= 3) { const h = fnv1a(w); idioms[h >>> 24].add(h); }
}
let nIdiom = 0;
idioms.forEach((set, i) => {
  const arr = [...set].sort((a, b) => a - b);
  const buf = Buffer.alloc(arr.length * 4);
  arr.forEach((h, j) => buf.writeUInt32LE(h, j * 4));
  fs.writeFileSync(path.join(out, 'idiom', i.toString(16).padStart(2, '0') + '.bin'), buf);
  nIdiom += arr.length;
});

console.log(`作品 ${docs}，句子條目 ${total}，成語 ${nIdiom}`);
