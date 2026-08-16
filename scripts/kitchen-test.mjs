let nextId = 1; const pending = new Map();
function send(socket, method, params = {}, timeout = 20000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => { pending.set(id, {res, rej});
    setTimeout(() => { if (pending.delete(id)) rej(new Error(`${method} timed out`)); }, timeout); });
}
async function ev(socket, expr) {
  const r = await send(socket, 'Runtime.evaluate', { expression: `(()=>{${expr}})()`, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description).split('\n')[0]);
  return r.result.value;
}
const list = await fetch('http://127.0.0.1:9222/json/list').then(r=>r.json());
const s = new WebSocket(list.find(x=>x.type==='page' && x.url.includes('4173')).webSocketDebuggerUrl);
s.addEventListener('message', e => { const m = JSON.parse(e.data); const w = pending.get(m.id); if (!w) return; pending.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); });
await new Promise(r => s.addEventListener('open', r, {once:true}));
await send(s, 'Runtime.enable');

const checks = [];
const check = (n, ok, d='') => { checks.push(ok); console.log(`${ok?'PASS':'FAIL'}  ${n}${d?`  — ${d}`:''}`); };
const wait = async (expr, label, n=100) => { for (let i=0;i<n;i++){ try { if (await ev(s, `return !!(${expr});`)) return true; } catch {} await new Promise(r=>setTimeout(r,200)); } throw new Error('timed out: '+label); };

await wait(`globalThis.__pcr?.scene.getScene('Title')?.scene.isActive()`, 'title');

// Plant a save with enough ingredients to brew everything once.
await ev(s, `localStorage.setItem('pcr.save.v1', JSON.stringify({
  version: 2, bestDistance: 1900, bestScore: 20, runs: 4, muted: true,
  ingredients: {'ingredient_sour-1': 12, 'ingredient_sour-2': 10, 'ingredient_sour-3': 3},
  upgrades: {}, stats: {deaths: 4, kills: 11, potions: 30, ingredients: 25}
})); return 1;`);

await ev(s, `globalThis.__pcr.scene.start('Kitchen'); return 1;`);
await wait(`globalThis.__pcr.scene.getScene('Kitchen')?.scene.isActive()`, 'kitchen');
await new Promise(r=>setTimeout(r,700));

const rows = await ev(s, `const k = globalThis.__pcr.scene.getScene('Kitchen');
  return k.rows.map(r => ({ id: r.def.id, label: r.buttonLabel.text }));`);
console.log('rows:', JSON.stringify(rows));
check('all three upgrades listed', rows.length === 3);
check('affordable ones offer a brew', rows[0].label === 'brew' && rows[1].label === 'brew', JSON.stringify(rows.map(r=>r.label)));
check('unaffordable one refuses', rows[2].label === 'not enough', rows[2].label);

// Press "brew" on Vitality, off-centre, through the real input pipeline.
const pos = await ev(s, `const k = globalThis.__pcr.scene.getScene('Kitchen');
  const b = k.rows[0].button; const bo = globalThis.__pcr.scale.canvasBounds; const sc = globalThis.__pcr.scale.displayScale;
  return { x: bo.left + (b.x + b.width*0.35)/sc.x, y: bo.top + (b.y + b.height*0.3)/sc.y };`);
await send(s, 'Input.dispatchMouseEvent', { type:'mousePressed', x:Math.round(pos.x), y:Math.round(pos.y), button:'left', clickCount:1 });
await new Promise(r=>setTimeout(r,50));
await send(s, 'Input.dispatchMouseEvent', { type:'mouseReleased', x:Math.round(pos.x), y:Math.round(pos.y), button:'left', clickCount:1 });
await new Promise(r=>setTimeout(r,600));

const after = await ev(s, `return JSON.parse(localStorage.getItem('pcr.save.v1'));`);
check('brewing raised Vitality', after.upgrades.vitality === 1, JSON.stringify(after.upgrades));
check('brewing spent 10 ingredients', after.ingredients['ingredient_sour-1'] === 2, String(after.ingredients['ingredient_sour-1']));

// And the run must actually feel it.
await ev(s, `globalThis.__pcr.scene.start('Game'); return 1;`);
await wait(`globalThis.__pcr.scene.getScene('Game')?.runner`, 'game');
const hp = await ev(s, `const g = globalThis.__pcr.scene.getScene('Game'); return { max: g.runner.maxHealth, health: g.runner.health };`);
check('the extra heart reaches the run', hp.max === 6 && hp.health === 6, JSON.stringify(hp));

s.close();
const failed = checks.filter(c=>!c).length;
console.log(`\n${checks.length-failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
