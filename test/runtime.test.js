import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test('health, efficiency and paid leave remain consistent in the card, scene and open detail panel', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99;
    const employee = sim.characters.find(ch => ch.id === 'backend');
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]}; employee.task = null;
    sim.health.backend = 0.5; render(); openCharPopup('backend');
  `);
  const document = office.window.document;
  const card = document.querySelector('#charactersBar [data-char-id="backend"]');
  expect(card.querySelector('.char-memory-count').textContent).toContain('效率 75%');
  expect(document.getElementById('popupHealth').textContent).toContain('效率 75%');
  office.evaluate('sim.health.backend = 0.2; sim.gameTime = 20.5; tick(0); render();');
  expect(card.dataset.activity).toBe('health_leave');
  expect(card.classList.contains('away')).toBe(true);
  expect(document.getElementById('popupAction').textContent).toBe('健康休假');
  expect(document.getElementById('popupHealth').textContent).toContain('效率 0%');
  expect(!!document.querySelector('.office-char[data-char-id="backend"]')).toBe(false);
  document.getElementById('resetBtn').click();
  expect(office.evaluate('sim.health.backend')).toBe(1);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").healthLeave')).toBe(false);
  expect(office.errors).toEqual([]);
});

test('the character card and an open detail panel update experience, promotion and salary together', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 10;
    const employee = sim.characters.find(ch => ch.id === 'backend');
    employee.career.hours = 239.5; employee.career.totalHours = 239.5;
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]};
    assignDeskTask(employee, {type: 'work'}, '內部工作', 0.5);
    sim.gameTime = 10.5; tick(0); employee.task = null; render(); openCharPopup('backend');
  `);
  const document = office.window.document;
  expect(document.querySelector('#charactersBar [data-char-id="backend"] .char-career')?.textContent).toContain('240/240');
  expect(document.getElementById('popupCareer')?.textContent).toContain('10%');
  office.evaluate('sim.gameTime = 20.5; tick(0); render();');
  expect(document.querySelector('#charactersBar [data-char-id="backend"] .char-role').textContent).toBe('中階工程師');
  expect(document.getElementById('popupRole').textContent).toBe('中階工程師');
  expect(document.getElementById('popupFinance').textContent).toContain('63,800');
  expect(document.getElementById('popupCareer')?.textContent).toContain('0/480');
  document.getElementById('resetBtn').click();
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").salary')).toBe(58000);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.totalHours')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('the character panel follows departures, arrivals and reset while retaining employee history', async () => {
  office = await loadOffice();
  const document = office.window.document;
  const techCard = document.querySelector('#charactersBar [data-char-id="tech"]');
  office.evaluate(`retireCharacter('designer'); render();`);
  expect(!!document.querySelector('#charactersBar [data-char-id="designer"]')).toBe(false);
  expect(document.querySelectorAll('#charactersBar .char-card')).toHaveLength(6);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "designer").departReason')).toBe('retired');
  office.evaluate(`hireCharacter('senior_dev'); render();`);
  expect(document.querySelectorAll('#charactersBar .char-card')).toHaveLength(7);
  expect(document.querySelector('#charactersBar [data-char-id="tech"]')).toBe(techCard);
  const newcomer = document.querySelector('#charactersBar [data-char-id="senior_dev"]');
  newcomer.focus(); newcomer.click();
  expect(document.getElementById('popupName').textContent).toBe('吳國豪');
  document.getElementById('charPopupClose').click();
  expect(document.activeElement).toBe(newcomer);
  newcomer.click();
  office.evaluate(`retireCharacter('senior_dev'); render();`);
  expect(document.getElementById('popupAction').textContent).toContain('已退休');
  document.getElementById('charPopupClose').click();
  expect(document.activeElement).toBe(document.querySelector('#charactersBar .char-card'));
  document.getElementById('resetBtn').click();
  expect(document.querySelectorAll('#charactersBar .char-card')).toHaveLength(7);
  expect(document.querySelector('#charactersBar [data-char-id="senior_dev"]')).toBeNull();
  expect(document.querySelector('#charactersBar [data-char-id="designer"]')).not.toBeNull();
  expect(office.errors).toEqual([]);
});

test.each([6, 13, 40])('meeting attendees and a visitor have separate displayed seats in a %s-seat company', async capacity => {
  office = await loadOffice();
  const result = office.evaluate(`(() => {
    Math.random = () => 0.99; sim.day = 2; sim.gameTime = 10; sim.budget = 50000000;
    sim.company.expansion = {additionalSeats: ${capacity} - 6, readyDay: 2}; CompanyGrowth.tick(10);
    for (let n = 7; n <= ${capacity}; n++) {
      const id = 'meeting_hire_' + n;
      sim.company.candidates.push({...CHARACTERS.find(ch => ch.id === 'tech'), id, name: '同事' + n});
      sim._hiredToday = false; if (!hireCharacter(id)) throw Error('Meeting fixture hire failed');
    }
    for (const ch of sim.characters) { ch.isPresent = true; ch.pos = {...POS[ch.deskId]}; ch.task = null; }
    render(); const normalHeight = document.documentElement.style.getPropertyValue('--scene-min-height');
    for (const ch of sim.characters) BIG_EVENTS.find(event => event.id === 'meeting').apply(ch);
    spawnClient();
    for (let n = 0; n < 200; n++) { CharacterSimulation.tick(1 / CFG.tickHz); tickClient(1 / CFG.tickHz); }
    render();
    const actors = [...document.querySelectorAll('.office-char')];
    const points = actors.map(el => el.style.left + ',' + el.style.top);
    const result = {attendees: actors.length, uniquePositions: new Set(points).size,
      tasks: sim.characters.every(ch => ch.task?.type === 'big_meeting' && ch.state !== 'walking')};
    sim.gameTime = 11.3;
    for (let n = 0; n < 200; n++) { CharacterSimulation.tick(1 / CFG.tickHz); tickClient(1 / CFG.tickHz); }
    render(); result.roomRestored = document.documentElement.style.getPropertyValue('--scene-min-height') === normalHeight;
    return result;
  })()`);
  expect(result.attendees).toBe(capacity + 2);
  expect(result.uniquePositions).toBe(result.attendees);
  expect(result.tasks).toBe(true);
  expect(result.roomRestored).toBe(true);
  expect(office.errors).toEqual([]);
});

test('speed cycles through 1, 2, 3, 5 and 10 with matching simulation rates, pause and reset', async () => {
  office = await loadOffice();
  const document = office.window.document;
  const button = document.getElementById('speedDisplay');
  const start = office.evaluate('sim.gameTime');
  office.step();
  const baseStep = office.evaluate('sim.gameTime') - start;
  for (const multiplier of [2, 3, 5, 10, 1]) {
    button.click();
    expect(button.textContent).toBe(multiplier + '×');
    expect(office.evaluate('sim.speed')).toBe(multiplier);
    const before = office.evaluate('sim.gameTime');
    office.step();
    expect(office.evaluate('sim.gameTime') - before).toBeCloseTo(baseStep * multiplier, 10);
  }
  for (let n = 0; n < 4; n++) button.click();
  document.getElementById('pauseBtn').click();
  const pausedAt = office.evaluate('sim.gameTime');
  office.step();
  expect(office.evaluate('sim.gameTime')).toBe(pausedAt);
  expect(button.textContent).toBe('10×');
  document.getElementById('resetBtn').click();
  expect(button.textContent).toBe('1×');
  expect(office.evaluate('sim.speed')).toBe(1);
  expect(office.errors).toEqual([]);
});

test('right-side panels collapse independently while their data and simulation keep updating', async () => {
  office = await loadOffice();
  const document = office.window.document;
  const buttons = [...document.querySelectorAll('[data-panel-toggle]')];
  expect(buttons).toHaveLength(3);
  for (const button of buttons) {
    button.focus(); button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(button.getAttribute('aria-controls')).hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  }
  const before = office.evaluate('sim.gameTime');
  office.step();
  expect(office.evaluate('sim.gameTime')).toBeGreaterThan(before);
  office.evaluate(`
    startNewProject({id: 'fold-test', name: '收合期間新增專案', type: 'tech', work: 40, reward: 200000});
    officeEvent('note', '收合期間新增日誌');
    sim.company.decision = '收合期間仍更新公司評估'; render();
  `);
  expect(document.getElementById('projectList').textContent).toContain('收合期間新增專案');
  expect(document.getElementById('timeline').textContent).toContain('收合期間新增日誌');
  expect(document.getElementById('companyBody').textContent).toContain('收合期間仍更新公司評估');
  for (const button of buttons) {
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')).hidden).toBe(false);
  }
  buttons[0].click();
  office.evaluate('resetAll();');
  expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
  buttons[0].click();
  expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
  expect(office.errors).toEqual([]);
});

test('page starts the office and advances the simulation without errors', async () => {
  office = await loadOffice();
  expect(office.errors).toEqual([]);
  expect(office.evaluate('sim.characters.length')).toBe(7);
  const before = office.evaluate('sim.gameTime');
  office.step();
  expect(office.evaluate('sim.gameTime')).toBeGreaterThan(before);
});

test('desk work starts its full duration only after the employee returns to their seat', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.5;
    sim.gameTime = 10;
    sim._lastBudgetDay = sim.day;
    sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    const tech = sim.characters[0];
    tech.isPresent = true;
    tech.state = 'sitting';
    tech.pos = { ...POS.sofa };
    tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '工作中', 0.5);
  `);
  expect(office.evaluate('sim.characters[0].task.endGT')).toBeUndefined();
  expect(office.evaluate('sim.characters[0].currentAction')).toBe('返回自己的座位');
  office.evaluate(`
    for (let step = 0; step < 200 && sim.characters[0].state === 'walking'; step++) tick(1 / CFG.tickHz);
  `);
  expect(office.evaluate('sim.characters[0].pos')).toEqual({ x: 6.9, y: 58.5 });
  expect(office.evaluate('sim.characters[0].state')).toBe('sitting');
  expect(office.evaluate('sim.characters[0].task.endGT - sim.gameTime')).toBeCloseTo(0.5);
  expect(office.evaluate('sim.characters[0].task.startedGT')).toBeCloseTo(office.evaluate('sim.gameTime'));
  expect(office.evaluate('sim.characters[0].currentAction')).not.toBe('返回自己的座位');
  expect(office.errors).toEqual([]);
});

test('task completion applies the weighted lunch efficiency through the simulation loop', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.5;
    sim.gameTime = 11;
    sim._lastBudgetDay = sim.day;
    sim.projects = [{id: 'work', name: '工作專案', type: 'tech', progress: 0, contributions: {},
      startDay: 1, startTime: 11, deadlineDays: 10}];
    sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    const tech = sim.characters[0];
    tech.isPresent = true;
    tech.pos = {...POS.desk1};
    tech.mood = moodFromValue(0.65);
    assignDeskTask(tech, {type: 'work'}, '工作中', 1);
    sim.gameTime = 12;
    tick(0);
  `);
  expect(office.evaluate('sim.projects[0].contributions.tech')).toBeCloseTo(0.98);
  expect(office.errors).toEqual([]);
});

test('changing days cleans retained records and leaves departed employees outside', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.characters.find(ch => ch.id === 'admin').employment = 'departed';
    sim.health.admin = 1;
    sim.events = Array.from({length: 501}, (_, id) => ({id, day: 1, type: 'note', text: '舊事件'}));
    sim.allMemories = Array.from({length: 201}, () => ({}));
    sim.lateRecords = Array.from({length: 101}, () => ({}));
    sim.gameTime = 20.5;
    tick(0);
  `);
  expect(office.evaluate('sim.day')).toBe(2);
  expect(office.evaluate('sim.gameTime')).toBe(7.5);
  expect(office.evaluate('sim.events.length')).toBeLessThanOrEqual(500);
  expect(office.evaluate('sim.allMemories.length')).toBeLessThanOrEqual(200);
  expect(office.evaluate('sim.lateRecords.length')).toBeLessThanOrEqual(100);
  expect(office.evaluate('sim.health.admin')).toBeUndefined();
  expect(office.evaluate('sim.relationships.tech.admin')).toBeUndefined();
  expect(office.evaluate('sim.characters.find(ch => ch.id === "admin").isPresent')).toBe(false);
  expect(office.evaluate('sim.characters.filter(ch => ch.isPresent).length')).toBe(0);
});

test('animation, pause, speed and repeated resets keep one simulation loop', async () => {
  office = await loadOffice();
  const document = office.window.document;
  for (let frame = 0; frame < 20; frame++) office.frame();
  expect(office.frames.size).toBe(1);
  document.getElementById('pauseBtn').click();
  const pausedAt = office.evaluate('sim.gameTime');
  office.step();
  expect(office.evaluate('sim.gameTime')).toBe(pausedAt);
  document.getElementById('pauseBtn').click();
  document.getElementById('speedDisplay').click();
  office.step();
  expect(office.evaluate('sim.gameTime') - pausedAt).toBeCloseTo(0.008);
  for (let reset = 0; reset < 5; reset++) document.getElementById('resetBtn').click();
  expect(office.frames.size).toBe(1);
  expect(office.intervals.size).toBe(1);
  office.step();
  expect(office.evaluate('sim.gameTime')).toBeGreaterThan(7.5);
  expect(document.getElementById('speedDisplay').textContent).toBe('1×');
  expect(office.errors).toEqual([]);
});

test('the clock opens attendance records with the employee, punch time and late minutes', async () => {
  office = await loadOffice();
  office.evaluate('sim.gameTime = 8.25; punchIn("tech"); render();');
  const document = office.window.document;
  document.getElementById('timeClock').click();
  const popup = document.getElementById('latePopup');
  expect(popup).not.toBeNull();
  expect(popup.classList.contains('hidden')).toBe(false);
  expect(popup.textContent).toContain('李志明');
  expect(popup.textContent).toContain('8:15');
  expect(popup.textContent).toContain('15 分鐘');
  document.getElementById('latePopupClose').click();
  expect(popup.classList.contains('hidden')).toBe(true);
});

test('normal 08:00 arrivals do not become zero-minute late records', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99;
    while (sim.gameTime < 8.01) tick(1 / CFG.tickHz);
    render();
  `);
  expect(office.evaluate('sim.lateRecords.length')).toBe(0);
  expect(office.window.document.getElementById('clockDisplay').textContent).toContain('遲到0');
});

test('an employee on an outside assignment remains visible as a doorway silhouette', async () => {
  office = await loadOffice();
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = false;
    sales.task = {type: 'client_visit', isOutside: true, endGT: 12};
    sales.currentAction = '拜訪客戶';
    render();
  `);
  const character = office.window.document.querySelector('.office-char[data-char-id="sales"]');
  expect(character).not.toBeNull();
  expect(character.classList.contains('silhouette-sales')).toBe(true);
  expect(character.style.left).toBe('50%');
  expect(character.style.top).toBe('95%');
  expect(character.textContent).toContain('拜訪客戶');
});

test('workstations are displayed in the center while their simulation coordinates stay unchanged', async () => {
  office = await loadOffice();
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true;
    tech.pos = {...POS.desk1};
    tech.targetPos = {...POS.desk1};
    tech.state = 'sitting';
    tech.task = {type: 'work', endGT: 11};
    render();
  `);
  const actor = office.window.document.querySelector('.office-char[data-char-id="tech"]');
  expect(parseFloat(actor.style.left)).toBeCloseTo(33.5);
  expect(parseFloat(actor.style.top)).toBeCloseTo(39.82036);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").pos')).toEqual({x: 6.9, y: 58.5});
  actor.click();
  expect(office.window.document.getElementById('popupName').textContent).toBe('李志明');
  expect(office.errors).toEqual([]);
});

test('walking follows a continuous display path to the relocated desk and can change destination', async () => {
  office = await loadOffice();
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true;
    tech.state = 'walking';
    tech.pos = {...POS.door};
    tech.targetPos = {...POS.desk1};
    render();
    tech.pos = {x: 28.45, y: 74.25};
    render();
  `);
  const actor = office.window.document.querySelector('.office-char[data-char-id="tech"]');
  expect(parseFloat(actor.style.left)).toBeCloseTo(41.75);
  expect(parseFloat(actor.style.top)).toBeCloseTo(64.91018);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.targetPos = {...POS.coffee};
    render();
  `);
  expect(parseFloat(actor.style.left)).toBeCloseTo(41.75);
  expect(parseFloat(actor.style.top)).toBeCloseTo(64.91018);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.pos = {...POS.coffee};
    tech.state = 'sitting';
    render();
  `);
  expect(parseFloat(actor.style.left)).toBeCloseTo(8.56);
  expect(parseFloat(actor.style.top)).toBeCloseTo(42.21557);
  expect(office.errors).toEqual([]);
});

test('a moving employee keeps keyboard focus while speech and task progress update', async () => {
  office = await loadOffice();
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true;
    tech.state = 'walking';
    tech.pos = {x: 20, y: 60};
    tech.task = {type: 'work', progress: 1, maxProgress: 4};
    tech.speech = {text: '正在整理文件', timer: 5};
    render();
  `);
  const document = office.window.document;
  const character = document.querySelector('.office-char[data-char-id="tech"]');
  const initialLeft = character.style.left;
  character.focus();
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.pos = {x: 25, y: 65};
    tech.task.progress = 3;
    tech.speech.text = '即將完成';
    render();
  `);
  expect(document.querySelector('.office-char[data-char-id="tech"]') === character).toBe(true);
  expect(document.activeElement === character).toBe(true);
  expect(character.style.left).not.toBe(initialLeft);
  expect(character.querySelector('.char-progress-fill').style.width).toBe('75%');
  expect(character.querySelector('.char-speech-bubble').textContent).toBe('即將完成');
  character.click();
  expect(document.getElementById('popupName').textContent).toBe('李志明');
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.task = null;
    tech.speech = null;
    render();
  `);
  expect(character.querySelector('.char-progress-bar').hidden).toBe(true);
  expect(character.querySelector('.char-speech-bubble').hidden).toBe(true);
  expect(office.errors).toEqual([]);
});

test('portraits stay consistent across the scene, cards, history and character details', async () => {
  office = await loadOffice();
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = true;
    sim.events = [{id: 900, day: 1, type: 'note', text: '歷史人物', chars: [
      {id: 'sales', name: '吳小琪', color: '#FF6F61'},
      {id: 'supplier2', name: '周協理', color: '#1a5276'},
      {id: 'intern1', name: '趙小華', color: '#45B7D1'},
      {id: 'unknown', name: '訪客', color: '#7777aa'},
    ]}];
    render();
  `);
  const document = office.window.document;
  const portrait = document.querySelector('.office-char[data-char-id="sales"] img').getAttribute('src');
  expect(portrait).toBe('assets/avatars/marketing.svg');
  expect(document.querySelector('.char-card[data-char-id="sales"] img').getAttribute('src')).toBe(portrait);
  expect([...document.querySelectorAll('.event-char img')].map(image => image.getAttribute('src'))).toEqual([
    portrait, 'assets/avatars/supplier.svg', 'assets/avatars/tech.svg', 'assets/avatars/unknown.svg',
  ]);
  const card = document.querySelector('.char-card[data-char-id="sales"]');
  card.focus();
  card.click();
  expect(document.querySelector('#popupEmoji img')?.getAttribute('src')).toBe(portrait);
  document.getElementById('popupMemoryBtn').click();
  expect(document.getElementById('memoryModal').classList.contains('hidden')).toBe(false);
  expect(document.querySelector('#modalCharName img').getAttribute('src')).toBe(portrait);
  document.dispatchEvent(new office.window.KeyboardEvent('keydown', {key: 'Escape'}));
  expect(document.getElementById('memoryModal').classList.contains('hidden')).toBe(true);
  document.dispatchEvent(new office.window.KeyboardEvent('keydown', {key: 'Escape'}));
  expect(document.getElementById('charPopup').classList.contains('hidden')).toBe(true);
  expect(document.activeElement === card).toBe(true);
  expect(office.errors).toEqual([]);
});

test('a character card keeps its focused portrait as status and memories change', async () => {
  office = await loadOffice();
  const document = office.window.document;
  const card = document.querySelector('.char-card[data-char-id="boss"]');
  const image = card.querySelector('img');
  card.focus();
  office.evaluate(`
    const boss = sim.characters.find(ch => ch.id === 'boss');
    boss.memories = [{type: 'note', text: '新記錄', day: 1}];
    boss.isPresent = true;
    boss.state = 'meeting';
    boss.task = {type: 'big_meeting'};
    render();
  `);
  expect(document.activeElement === card).toBe(true);
  expect(card.querySelector('img') === image).toBe(true);
  expect(card.classList.contains('away')).toBe(false);
  expect(card.textContent).toContain('會議中');
  expect(card.textContent).toContain('1 條記憶');
  card.click();
  expect(document.getElementById('popupName').textContent).toBe('張志強');
  expect(office.errors).toEqual([]);
});

test('the scene reuses visitors and removes actors that have left', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.characters.find(ch => ch.id === 'tech').isPresent = true;
    sim.client = {...CLIENTS[0], state: 'standing', pos: {x: 70, y: 20}};
    sim.supplier = {...SUPPLIERS[0], state: 'standing', pos: {x: 75, y: 25}};
    render();
  `);
  const document = office.window.document;
  const client = document.querySelector('[data-actor-key="visitor:client1"]');
  const initialLeft = client.style.left;
  expect(document.querySelectorAll('.office-char')).toHaveLength(4);
  office.evaluate('sim.client.pos.x = 72; render();');
  expect(document.querySelector('[data-actor-key="visitor:client1"]') === client).toBe(true);
  expect(client.style.left).not.toBe(initialLeft);
  office.evaluate(`
    sim.client = null;
    sim.supplier = null;
    sim.characters.find(ch => ch.id === 'tech').employment = 'departed';
    render();
  `);
  expect(document.querySelectorAll('.office-char')).toHaveLength(1);
  expect(document.querySelector('.office-char[data-char-id="tech"]')).toBeNull();
  document.getElementById('resetBtn').click();
  expect(document.querySelectorAll('.char-card')).toHaveLength(7);
  expect(document.querySelectorAll('.office-char')).toHaveLength(1);
  expect(office.errors).toEqual([]);
});

test('a sales project requiring two visits is accepted only after both finish', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.5;
    sim.day = 3;
    sim.gameTime = 10;
    sim._lastBudgetDay = 3;
    sim.characters.forEach(ch => {
      ch.isPresent = true;
      ch.state = 'sitting';
      ch.pos = {...POS[ch.deskId]};
      ch.task = { type: 'break', endGT: 20 };
    });
    tick(0);
    sim._projectAttempt.visitsNeeded = 2;
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = false;
    sales.state = 'gone';
    sales.task = {type: 'client_visit', isOutside: true, endGT: 10,
      _projectAttemptId: sim._projectAttempt.proj.id};
    tick(0);
  `);
  expect(office.evaluate('sim.projects.length')).toBe(0);
  expect(office.evaluate('sim._projectAttempt.visitsDone')).toBe(1);
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = false;
    sales.state = 'gone';
    sales.task = {type: 'client_visit', isOutside: true, endGT: 10,
      _projectAttemptId: sim._projectAttempt.proj.id};
    tick(0);
  `);
  expect(office.evaluate('sim.projects.length')).toBe(1);
  expect(office.evaluate('sim._projectAttempt')).toBeNull();
});

test.each([42, 7])('the office can simulate 31 days with valid characters and finances (seed %s)', async seedValue => {
  office = await loadOffice();
  const result = office.evaluate(`
    (() => {
      let seed = ${seedValue};
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let ticks = 0; sim.day < 32 && ticks < 110000; ticks++) {
        tick(1 / CFG.tickHz);
        if (!Number.isFinite(sim.budget)) throw Error('Invalid company balance');
        const ids = sim.characters.map(ch => ch.id);
        if (new Set(ids).size !== ids.length) throw Error('Duplicate character id');
        if (!Object.values(sim.dailyExpenses).every(amount => Number.isFinite(amount) && amount >= 0)) {
          throw Error('Invalid daily expense');
        }
        for (const ch of sim.characters) {
          if (ch.employment === 'departed') continue;
          if (![ch.pos.x, ch.pos.y, ch.money, ch.mood.value, sim.health[ch.id]].every(Number.isFinite)) {
            throw Error('Invalid character state: ' + ch.id);
          }
        }
      }
      render();
      return { day: sim.day, settledDay: sim.lastSettlement.day };
    })()
  `);
  expect(result.day).toBe(32);
  expect(result.settledDay).toBe(31);
  expect(office.errors).toEqual([]);
}, 15000);
