import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { solveOrbment } from '../src/solver.js';
import { parseQuartz, parseArts } from '../src/data.js';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const quartz = parseQuartz(await read('sora-2nd-quartz.csv'));
const { characters } = JSON.parse(await read('sora-2nd-orbments.json'));
const arts = parseArts(await read('sora-2nd-arts.csv'));
const names = ['十二宫星环', '风之跃行', '时间加速改', '大地之墙'];
const request = {
  characterId: 'zin',
  artRequirements: names.map((id) => arts.find((art) => art.id === id).attributes),
  requiredQuartzIds: [], excludedQuartzIds: [],
};
// 每次直接求解，不读取结果缓存；首轮包含 JIT 冷启动开销。
for (let run = 1; run <= 5; run++) {
  const start = performance.now();
  const result = await solveOrbment(request, { characters, quartz });
  console.log(JSON.stringify({ run, ms: Math.round(performance.now() - start),
    status: result.status, count: result.solutions.length, truncated: result.truncated }));
}
