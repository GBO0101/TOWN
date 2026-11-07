/**
 * Characterization test setup — loads data.js into global scope.
 * We use eval to execute code directly in global scope for reliable global exposure.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal DOM canvas for code that references it
const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
canvas.id = 'gameCanvas';
document.body.appendChild(canvas);

// Load and execute data.js only using eval for global exposure
const dataCode = readFileSync(resolve(root, 'js/data.js'), 'utf-8');
eval(dataCode);
