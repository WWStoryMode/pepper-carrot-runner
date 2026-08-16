/**
 * Drive the running game with real mouse input, over the Chrome DevTools
 * Protocol.
 *
 * Written after the game-over buttons shipped completely dead. Unit tests do
 * not press anything and screenshots do not either, so the whole class of "the
 * button renders but does nothing" bug was invisible to every check in the
 * project. This presses them.
 *
 * Requires Chrome already listening on --remote-debugging-port, and Node's
 * WebSocket:
 *
 *   node --experimental-websocket scripts/click-test.mjs [url] [port]
 */

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const port = Number(process.argv[3] ?? 9222);

let nextId = 1;
const pending = new Map();

function send(socket, method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 30000);
  });
}

/** Run an expression in the page and return its value. */
async function evaluate(socket, expression) {
  const result = await send(socket, 'Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
  }
  return result.result.value;
}

async function waitFor(socket, expression, label, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(socket, `return !!(${expression});`)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function pressSpace(socket) {
  for (const type of ['keyDown', 'keyUp']) {
    await send(socket, 'Input.dispatchKeyEvent', {
      type,
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32,
    });
  }
}

async function click(socket, x, y) {
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  await send(socket, 'Input.dispatchMouseEvent', { ...base, type: 'mousePressed' });
  await new Promise((r) => setTimeout(r, 40));
  await send(socket, 'Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' });
}

/** Page coordinates of an overlay button, via Phaser's own scale transform. */
const BUTTON_POSITION = (index) => `
  const game = globalThis.__pcr;
  const scene = game.scene.getScene('Game');
  const button = scene.modal.buttons[${index}].background;
  const bounds = game.scale.canvasBounds;
  const scale = game.scale.displayScale;
  return {
    x: bounds.left + button.x / scale.x,
    y: bounds.top + button.y / scale.y,
    label: scene.modal.buttons[${index}].label.text,
  };
`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const listing = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const target = listing.find((t) => t.type === 'page' && t.url.startsWith(url.split('?')[0]));
  if (!target) throw new Error(`no page target for ${url}`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('cdp connect failed')), { once: true });
  });

  await send(socket, 'Runtime.enable');

  // The title screen is first; start a run.
  await waitFor(socket, `globalThis.__pcr?.scene.getScene('Title')?.scene.isActive()`, 'title');
  await evaluate(socket, `globalThis.__pcr.scene.start('Game'); return true;`);
  await waitFor(socket, `globalThis.__pcr.scene.getScene('Game')?.runner`, 'game scene');

  // Silence it: building an AudioContext on a machine with no audio device
  // stalls the page for seconds, which would be mistaken for a hang.
  await evaluate(socket, `globalThis.__pcr.scene.getScene('Game').sfx.setMuted(true); return true;`);

  // Let it run into something. Every fresh run ends quickly at present.
  await waitFor(socket, `globalThis.__pcr.scene.getScene('Game').runner.isDead`, 'the run to end');
  const modalUp = await evaluate(
    socket,
    `return globalThis.__pcr.scene.getScene('Game').modal.isVisible;`,
  );
  check('game-over panel appears', modalUp === true);

  // --- the reported bug: do the buttons do anything at all? ---
  await waitFor(socket, `globalThis.__pcr.scene.getScene('Game').runner.isDead`, 'a second death');

  const again = await evaluate(socket, BUTTON_POSITION(0));
  check('first button is "run again"', again.label === 'run again', again.label);

  await click(socket, again.x, again.y);
  await new Promise((r) => setTimeout(r, 500));

  const afterRestart = await evaluate(
    socket,
    `const s = globalThis.__pcr.scene.getScene('Game');
     return { dead: s.runner.isDead, modal: s.modal.isVisible };`,
  );
  check(
    '"run again" restarts the run',
    afterRestart.dead === false && afterRestart.modal === false,
    JSON.stringify(afterRestart),
  );

  // --- and the second one, last, because it leaves the scene ---
  await waitFor(socket, `globalThis.__pcr.scene.getScene('Game').runner.isDead`, 'a third death');
  const menu = await evaluate(socket, BUTTON_POSITION(1));
  check('second button is "menu"', menu.label === 'menu', menu.label);

  await click(socket, menu.x, menu.y);
  await new Promise((r) => setTimeout(r, 700));

  const onTitle = await evaluate(
    socket,
    `return globalThis.__pcr.scene.getScene('Title').scene.isActive();`,
  );
  check('"menu" returns to the title', onTitle === true);

  if (process.env.CLICK_TEST_KEYBOARD === '1') {
  // --- keyboard restart, checked first so it is never masked by a scene change ---
    await pressSpace(socket);
    await new Promise((r) => setTimeout(r, 500));

    const afterSpace = await evaluate(
      socket,
      `const s = globalThis.__pcr.scene.getScene('Game');
       return { dead: s.runner.isDead, modal: s.modal.isVisible };`,
    );
    check(
      'space restarts from the end screen',
      afterSpace.dead === false && afterSpace.modal === false,
      JSON.stringify(afterSpace),
    );

  }

  socket.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
