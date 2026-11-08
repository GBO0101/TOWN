import { JSDOM, VirtualConsole } from 'jsdom';
import { readOfficePage } from './office-scripts.js';

export async function loadOffice() {
  const { html, scripts } = readOfficePage();
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: console });
  const { window } = dom;
  let nextId = 0;
  let clock = 0;
  const frames = new Map();
  const intervals = new Map();
  window.requestAnimationFrame = fn => { frames.set(++nextId, fn); return nextId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setInterval = fn => { intervals.set(++nextId, fn); return nextId; };
  window.clearInterval = id => intervals.delete(id);
  window.performance.now = () => clock;
  window.console.error = (...args) => errors.push(args.map(String).join(' '));
  for (const { path, source } of scripts) {
    const script = window.document.createElement('script');
    script.textContent = source + '\n//# sourceURL=' + path;
    window.document.body.append(script);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  return {
    window, errors, frames, intervals,
    evaluate: source => window.eval(source),
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(fn => fn());
    },
    step(elapsedMs = 50) {
      clock += elapsedMs;
      [...intervals.values()].forEach(fn => fn());
    },
    close() { window.close(); },
  };
}
