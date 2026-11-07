import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test('large starting capital cannot unlock internal research before the middle-game stage', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.budget = 100000000; sim.day = 87; sim.gameTime = 9;
    for (const ch of sim.characters) { ch.isPresent = true; ch.pos = {...POS[ch.deskId]}; ch.state = 'sitting'; ch.task = null; }
    tick(0);
  `);
  expect(office.evaluate('sim.products.length')).toBe(0);
  expect(office.evaluate('sim.finance.payables.some(item => item.category === "自研啟動")')).toBe(false);
  office.evaluate('sim.day = 88; sim.gameTime = 9; tick(0);');
  expect(office.evaluate('sim.products[0].invested')).toBe(3000000);
  expect(office.errors).toEqual([]);
});

test('the game remains locked until the late-game stage even when the company can afford it', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.budget = 100000000; sim.day = 88; sim.gameTime = 9;
    for (const ch of sim.characters) { ch.isPresent = true; ch.pos = {...POS[ch.deskId]}; ch.state = 'sitting'; ch.task = null; }
    tick(0); completeProject(sim.projects[0]); sim.day = 175; sim.gameTime = 9; tick(0);
  `);
  expect(office.evaluate('sim.products.length')).toBe(1);
  expect(office.evaluate('sim.productDecision')).toContain('176');
  office.evaluate('sim.day = 176; sim.gameTime = 9; tick(0);');
  expect(office.evaluate('sim.products[1].invested')).toBe(8000000);
  expect(office.errors).toEqual([]);
});

test('having the website startup cost alone is insufficient without the operating reserve', async () => {
  await readyCompany(4000000);
  expect(office.evaluate('sim.products.length')).toBe(0);
  expect(office.evaluate('sim.finance.payables.some(item => item.category === "自研啟動")')).toBe(false);
  expect(office.evaluate('sim.productDecision')).toContain('三個月');
  expect(office.errors).toEqual([]);
});

test('the late-game investment still requires its startup cost plus the full operating reserve', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]); CompanyFinance.settle();
    sim.day = 176; sim.gameTime = 9; sim.budget = 10000000; tick(0);
  `);
  expect(office.evaluate('sim.products.length')).toBe(1);
  office.evaluate('sim.day = 177; sim.gameTime = 9; sim.budget = 12000000; tick(0);');
  expect(office.evaluate('sim.products[1].invested')).toBe(8000000);
  expect(office.errors).toEqual([]);
});

async function readyCompany(budget = 6000000) {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.day = 88; sim.gameTime = 9; sim.budget = ${budget};
    for (const ch of sim.characters) {
      ch.isPresent = true; ch.pos = {...POS[ch.deskId]}; ch.state = 'sitting'; ch.task = null;
    }
    tick(0);
  `);
}

async function operatingCompany() {
  await readyCompany();
  office.evaluate(`completeProject(sim.projects[0]); sim.characters = sim.characters.filter(ch => ch.id !== 'boss'); sim.day = 89; sim.gameTime = 9;`);
}

function finishSalesVisit(random = 0) {
  office.evaluate(`
    for (let n = 0; n < 200; n++) CharacterSimulation.tick(1 / CFG.tickHz);
    Math.random = () => ${random}; sim.gameTime = 12; CharacterSimulation.tick(0);
    for (let n = 0; n < 200; n++) CharacterSimulation.tick(1 / CFG.tickHz);
  `);
}

test('a live product generates one maintenance job even without its boss or an available client slot', async () => {
  await readyCompany();
  office.evaluate(`
    Math.random = () => 0; completeProject(sim.projects[0]);
    sim.maxProjects = 0; sim.characters.find(ch => ch.id === 'boss').isPresent = false;
    sim.day = 97; sim.gameTime = 9; tick(0);
  `);
  expect(office.evaluate('sim.projects.length')).toBe(0);
  office.evaluate('sim.day = 98; sim.gameTime = 9; tick(0); tick(0);');
  expect(office.evaluate('sim.projects.length')).toBe(1);
  expect(office.evaluate('sim.projects[0]')).toMatchObject({source: 'product', maintenance: true,
    productId: 'product_1', work: 8, reward: 0, deposit: 0, deadlineDay: 100});
  expect(office.evaluate('Object.keys(sim.finance.advances)')).toEqual([]);
  expect(office.errors).toEqual([]);
});

test('employees prioritize maintenance at their desks and its completion creates no financial reward', async () => {
  await readyCompany();
  office.evaluate(`
    Math.random = () => 0; completeProject(sim.projects[0]);
    sim.day = 98; sim.gameTime = 9; tick(0);
    const maintenance = sim.projects.find(project => project.maintenance);
    maintenance.workDay = sim.day; maintenance.workToday = 1000;
    maintenance.workDone = 7.9; maintenance.progress = 7.9 / 8 * 100; maintenance.contributions.tech = 7.9;
    startNewProject({id: 'maintenance-client', name: '客戶合約', type: 'tech', work: 100, reward: 300000});
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.pos = {...POS[tech.deskId]}; tech.state = 'sitting'; tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '處理維護', 0.5);
    window.maintenanceId = maintenance.id;
    window.moneyBeforeMaintenance = JSON.stringify({cash: sim.budget, finance: sim.finance});
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.projectId')).toBe(office.evaluate('window.maintenanceId'));
  office.evaluate('sim.gameTime = 9.5; updateProjectWork();');
  expect(office.evaluate('sim.projects.some(project => project.maintenance)')).toBe(false);
  expect(office.evaluate('sim.products[0]')).toMatchObject({phase: 'live', launchedDay: 88, nextMaintenanceDay: 108});
  expect(office.evaluate('JSON.stringify({cash: sim.budget, finance: sim.finance})')).toBe(office.evaluate('window.moneyBeforeMaintenance'));
  expect(office.evaluate('sim.lastProjectResult')).toMatchObject({maintenance: true, status: 'completed'});
  expect(office.errors).toEqual([]);
});

test('overdue maintenance remains repairable and loses customers once per daily settlement until it is fixed', async () => {
  await readyCompany();
  office.evaluate(`
    Math.random = () => 0; completeProject(sim.projects[0]); sim.products[0].customers = 100;
    sim.day = 98; sim.gameTime = 9; tick(0);
    for (const ch of sim.characters) { ch.task = null; ch.isPresent = false; }
    sim.day = 100; sim.gameTime = 20.5; CompanyFinance.accrueDay();
  `);
  expect(office.evaluate('sim.products[0].customers')).toBe(100);
  office.evaluate('sim.day = 101; ProjectPipeline.tick(18); CompanyFinance.accrueDay(); CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.projects.some(project => project.maintenance && project.status === "active")')).toBe(true);
  expect(office.evaluate('sim.products[0].customers')).toBe(95);
  expect(office.evaluate('sim.products[0].lastIncome')).toMatchObject({customers: 95, revenue: 15200, cost: 6300});
  office.evaluate('sim.day = 102; CompanyFinance.accrueDay(); CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.products[0].customers')).toBe(90);
  expect(office.evaluate('sim.projects.find(project => project.maintenance).lostCustomers')).toBe(10);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(45600);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(18900);
  office.evaluate(`
    const maintenance = sim.projects.find(project => project.maintenance);
    maintenance.workDone = 7.9; maintenance.progress = 7.9 / 8 * 100; maintenance.contributions.tech = 7.9;
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true; tech.pos = {...POS[tech.deskId]}; tech.state = 'sitting'; tech.task = null;
    sim.gameTime = 9; assignDeskTask(tech, {type: 'work'}, '修復逾期維護', 0.5);
    sim.gameTime = 9.5; updateProjectWork();
  `);
  expect(office.evaluate('sim.projects.some(project => project.maintenance)')).toBe(false);
  office.evaluate('sim.day = 103; CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.products[0].customers')).toBe(90);
  expect(office.evaluate('sim.products[0].lastIncome')).toMatchObject({customers: 90, revenue: 14400, cost: 6100});
  expect(office.evaluate('sim.finance.revenueSources.contracts')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('stopping one product cancels its maintenance and releases its workers without cancelling another product job', async () => {
  await readyCompany();
  office.evaluate(`
    Math.random = () => 0; completeProject(sim.projects[0]);
    sim.day = 176; sim.gameTime = 9; sim.budget = 20000000; tick(0);
    completeProject(sim.projects.find(project => !project.maintenance));
    sim.day = 186; sim.gameTime = 9; tick(0);
    for (const ch of sim.characters) ch.task = null;
    const tech = sim.characters.find(ch => ch.id === 'tech'); tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '處理維護', 0.5);
    window.cancelledMaintenanceId = tech.task.projectId;
    sim.products.find(product => product.catalogId === 'website').phase = 'stopped';
    ProjectPipeline.tick(9);
  `);
  expect(office.evaluate('sim.projects.filter(project => project.maintenance).map(project => project.productId)')).toEqual(['product_2']);
  expect(office.evaluate('sim.characters.some(ch => ch.task?.projectId === window.cancelledMaintenanceId)')).toBe(false);
  expect(office.evaluate('sim.lastProjectResult.status')).toBe('cancelled');
  expect(office.evaluate('sim.finance.payables.some(item => item.category === "專案賠償" || item.category === "退還訂金")')).toBe(false);
  expect(office.errors).toEqual([]);
});

test('the panels distinguish scheduled, overdue and completed maintenance from paid client work', async () => {
  await readyCompany();
  office.evaluate('Math.random = () => 0; completeProject(sim.projects[0]); render();');
  const document = office.window.document;
  expect(document.querySelector('.product-maintenance')?.textContent).toContain('第 98 天');
  office.evaluate('sim.day = 98; sim.gameTime = 9; tick(0); render();');
  const jobId = office.evaluate('sim.projects.find(project => project.maintenance).id');
  const jobCard = () => document.querySelector(`[data-project-id="${jobId}"]`);
  expect(jobCard()?.querySelector('.project-finance').textContent).toContain('無報酬');
  expect(jobCard()?.querySelector('.project-deadline').textContent).toContain('第 100 天');
  office.evaluate('sim.day = 101; render();');
  expect(document.querySelector('.product-maintenance').textContent).toContain('逾期');
  expect(document.querySelector('.product-maintenance').textContent).toContain('5%');
  expect(jobCard().querySelector('.project-deadline').textContent).toContain('流失');
  office.evaluate('completeProject(sim.projects.find(project => project.maintenance)); render();');
  expect(jobCard().querySelector('.project-percent').textContent).toBe('維護完成');
  expect(document.querySelector('.product-maintenance').textContent).toContain('第 111 天');
  expect(office.errors).toEqual([]);
});

test('an unresolved maintenance job is not duplicated and the next job waits until after its completion', async () => {
  await readyCompany();
  office.evaluate('Math.random = () => 0.99; completeProject(sim.projects[0]);');
  expect(office.evaluate('sim.products[0].nextMaintenanceDay')).toBe(106);
  office.evaluate('sim.day = 106; sim.gameTime = 9; ProjectPipeline.tick(9); window.firstMaintenanceId = sim.projects[0].id;');
  office.evaluate('sim.day = 120; ProjectPipeline.tick(9); ProjectPipeline.tick(9);');
  expect(office.evaluate('sim.projects.filter(project => project.maintenance).map(project => project.id)')).toEqual([office.evaluate('window.firstMaintenanceId')]);
  office.evaluate('completeProject(sim.projects[0]); sim.day = 137; ProjectPipeline.tick(9);');
  expect(office.evaluate('sim.products[0].nextMaintenanceDay')).toBe(138);
  expect(office.evaluate('sim.projects.filter(project => project.maintenance).length')).toBe(0);
  office.evaluate('sim.day = 138; ProjectPipeline.tick(9);');
  expect(office.evaluate('sim.projects.filter(project => project.maintenance).length')).toBe(1);
  expect(office.evaluate('sim.projects[0].id')).not.toBe(office.evaluate('window.firstMaintenanceId'));
  expect(office.errors).toEqual([]);
});

test('maintenance churn rounds up the last customer and never creates negative customers or revenue', async () => {
  await readyCompany();
  office.evaluate(`
    Math.random = () => 0; completeProject(sim.projects[0]); sim.products[0].customers = 1;
    sim.day = 98; sim.gameTime = 9; ProjectPipeline.tick(9);
    sim.day = 101; CompanyFinance.accrueDay(); sim.day = 102; CompanyFinance.accrueDay();
  `);
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(0);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(5000);
  expect(office.evaluate('sim.projects.find(project => project.maintenance).lostCustomers')).toBe(1);
  expect(office.errors).toEqual([]);
});

test('a newly launched product has no paying customers or automatic income but still incurs its fixed costs', async () => {
  await readyCompany();
  office.evaluate(`completeProject(sim.projects[0]); sim.day = 89; CompanyFinance.accrueDay(); CompanyFinance.accrueDay();`);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(0);
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(2500);
  expect(office.errors).toEqual([]);
});

test('sales staff gain product customers only after a real successful visit and cannot credit it twice', async () => {
  await readyCompany();
  office.evaluate(`completeProject(sim.projects[0]); sim.characters = sim.characters.filter(ch => ch.id !== 'boss'); sim.day = 89; sim.gameTime = 9; tick(0);`);
  expect(office.evaluate('sim._projectAttempt?.kind')).toBe('product');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").task.type')).toBe('client_visit');
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  office.evaluate(`
    for (let n = 0; n < 200; n++) CharacterSimulation.tick(1 / CFG.tickHz);
    Math.random = () => 0; sim.gameTime = 12; CharacterSimulation.tick(0); CharacterSimulation.tick(0);
  `);
  expect(office.evaluate('sim.products[0].customers')).toBe(2);
  expect(office.evaluate('sim.products[0].lastSale.salesId')).toBe('sales');
  expect(office.evaluate('sim._projectAttempt')).toBeNull();
  expect(office.evaluate('sim.projects.length')).toBe(0);
  expect(office.evaluate('sim.finance.revenue')).toBe(0);
  expect(office.evaluate('Object.keys(sim.finance.advances)')).toEqual([]);
  expect(office.errors).toEqual([]);
});

test('new products have a customer acquisition period before repeated losses trigger shutdown', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]);
    for (let day = 89; day <= 110; day++) { sim.day = day; sim.gameTime = 20.5; tick(0); }
    sim.gameTime = 9; tick(0);
  `);
  expect(office.evaluate('sim.products[0].phase')).toBe('live');
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('the product panel shows paying customers, unit pricing and the increased operating costs', async () => {
  await readyCompany();
  office.evaluate(`completeProject(sim.projects[0]); sim.products[0].customers = 50; sim.day = 89; CompanyFinance.accrueDay(); render();`);
  const card = office.window.document.querySelector('#productList [data-product-id]');
  expect(card.querySelector('.product-customers')?.textContent).toContain('50');
  expect(card.querySelector('.product-customers')?.textContent).toContain('$160');
  expect(card.querySelector('.product-daily').textContent).toContain('$8,000');
  expect(card.querySelector('.product-costs').textContent).toContain('$4,500');
  expect(card.querySelector('.product-costs').textContent).toContain('$1,800');
  expect(card.querySelector('.product-costs').textContent).toContain('$600');
  expect(office.errors).toEqual([]);
});

test('a full contract queue without a live product preserves the daily lead opportunity', async () => {
  await readyCompany();
  office.evaluate(`sim.day = 89; sim.maxProjects = 0; ProjectPipeline.tick(9);`);
  expect(office.evaluate('sim.finance.lastLeadDay')).toBe(88);
  office.evaluate(`sim.maxProjects = 3; Math.random = () => 0; ProjectPipeline.tick(10);`);
  expect(office.evaluate('!!sim._projectAttempt')).toBe(true);
  expect(office.evaluate('sim._projectAttempt.kind === "product"')).toBe(false);
  expect(office.errors).toEqual([]);
});

test('an unsuccessful product visit gains no customers or unearned income', async () => {
  await operatingCompany(); office.evaluate('tick(0);'); finishSalesVisit(0.99);
  office.evaluate('CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(0);
  expect(office.evaluate('sim.products[0].lastSale')).toBeUndefined();
  expect(office.errors).toEqual([]);
});

test('existing paying customers keep producing recurring income while sales staff are absent', async () => {
  await operatingCompany();
  office.evaluate(`
    sim.products[0].customers = 50; retireCharacter('sales');
    CompanyFinance.accrueDay(); sim.day = 90; CompanyFinance.accrueDay();
  `);
  expect(office.evaluate('sim.products[0].customers')).toBe(50);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(16000);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(9000);
  expect(office.errors).toEqual([]);
});

test('a salesperson on recovery leave cannot create customers or start a product visit', async () => {
  await operatingCompany();
  office.evaluate('sim.health.sales = 0.2; sim.gameTime = 20.5; tick(0); sim.gameTime = 9; tick(0);');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").healthLeave')).toBe(true);
  expect(office.evaluate('sim._projectAttempt')).toBeNull();
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('product outreach leaves the following day available for customer contracts', async () => {
  await operatingCompany(); office.evaluate('tick(0);'); finishSalesVisit();
  office.evaluate('sim.day = 90; sim.gameTime = 9; Math.random = () => 0; ProjectPipeline.tick(9);');
  expect(office.evaluate('!!sim._projectAttempt')).toBe(true);
  expect(office.evaluate('sim._projectAttempt.kind === "product"')).toBe(false);
  expect(office.evaluate('sim.products[0].customers')).toBe(2);
  expect(office.errors).toEqual([]);
});

test('product outreach can continue while all customer contract slots are occupied', async () => {
  await operatingCompany(); office.evaluate('tick(0);'); finishSalesVisit();
  office.evaluate('sim.day = 90; sim.gameTime = 9; sim.maxProjects = 0; ProjectPipeline.tick(9);');
  expect(office.evaluate('sim._projectAttempt.kind')).toBe('product');
  expect(office.evaluate('sim._projectAttempt.proj.id === sim.products[0].id')).toBe(true);
  expect(office.errors).toEqual([]);
});

test('stopping a product during a visit prevents new customers and operating bills', async () => {
  await operatingCompany(); office.evaluate('tick(0); sim.products[0].phase = "stopped";'); finishSalesVisit();
  office.evaluate('CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.products[0].customers')).toBe(0);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(0);
  expect(office.evaluate('sim.finance.payables.some(item => item.category === "伺服器租用")')).toBe(false);
  expect(office.errors).toEqual([]);
});

test('a replacement salesperson can finish an uncompleted product lead after the original employee leaves', async () => {
  await operatingCompany();
  office.evaluate(`
    tick(0); retireCharacter('sales');
    sim.company.candidates.push({...CHARACTERS.find(ch => ch.id === 'sales'), id: 'product_sales_replacement', name: '接任業務'});
    sim._hiredToday = false; hireCharacter('product_sales_replacement');
    const replacement = sim.characters.find(ch => ch.id === 'product_sales_replacement');
    replacement.pos = {...POS[replacement.deskId]}; replacement.state = 'sitting'; replacement.task = null;
    ProjectPipeline.tick(9);
  `);
  finishSalesVisit();
  expect(office.evaluate('sim.products[0].customers')).toBe(2);
  expect(office.evaluate('sim.products[0].lastSale.salesId')).toBe('product_sales_replacement');
  expect(office.errors).toEqual([]);
});

test('the boss funds an internal product as development work without customer deposits or instant revenue', async () => {
  await readyCompany();
  expect(office.evaluate('sim.products.length')).toBe(1);
  expect(office.evaluate('sim.products[0].phase')).toBe('developing');
  expect(office.evaluate('sim.projects[0].source')).toBe('product');
  expect(office.evaluate('sim.finance.payables.find(item => item.category === "自研啟動").amount')).toBe(3000000);
  expect(office.evaluate('sim.budget')).toBe(6000000);
  expect(office.evaluate('sim.finance.revenue')).toBe(0);
  expect(office.evaluate('Object.keys(sim.finance.advances)')).toEqual([]);
  expect(office.errors).toEqual([]);
});

test('internal development launches only after employees actually finish its work', async () => {
  await readyCompany();
  office.evaluate(`
    const development = sim.projects[0]; development.workDone = 79.9; development.progress = 79.9 / 80 * 100; development.contributions.tech = 79.9;
    const tech = sim.characters.find(ch => ch.id === 'tech'); tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '完成自研開發', 0.5);
    sim.gameTime = 9.5; updateProjectWork();
  `);
  expect(office.evaluate('sim.products[0].phase')).toBe('live');
  expect(office.evaluate('sim.projects.length')).toBe(0);
  expect(office.evaluate('sim.finance.revenue')).toBe(0);
  expect(office.evaluate('sim.finance.receivables.length')).toBe(0);
  expect(office.evaluate('Object.keys(sim.finance.advances)')).toEqual([]);
  expect(office.errors).toEqual([]);
});

test('an operating product earns daily revenue and pays server and facility costs once at day close', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]); CompanyFinance.settle();
    sim.day = 89; sim.gameTime = 20.5;
    sim.products[0].customers = 50;
    window.cashBefore = sim.budget;
    CompanyFinance.accrueDay(); CompanyFinance.accrueDay();
  `);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(8000);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(4500);
  expect(office.evaluate('sim.budget - window.cashBefore')).toBe(8000);
  expect(office.evaluate('sim.finance.payables.filter(item => item.productId === sim.products[0].id).map(item => item.category)')).toEqual(['伺服器租用', '機房空間', '網路頻寬', '產品維運']);
  office.evaluate('CompanyFinance.settle(); CompanyFinance.settle();');
  expect(office.evaluate('sim.budget - window.cashBefore')).toBe(3500);
  expect(office.evaluate('sim.lastSettlement.categories["伺服器租用"]')).toBe(1800);
  expect(office.evaluate('sim.lastSettlement.categories["機房空間"]')).toBe(600);
  office.evaluate(`
    window.cashAfterFirst = sim.budget; window.burnAfterFirst = CompanyFinance.monthlyBurn();
    sim.products[0].customers = 100; sim.day = 90; CompanyFinance.accrueDay(); CompanyFinance.settle(); CompanyFinance.settle();
  `);
  expect(office.evaluate('sim.budget - window.cashAfterFirst')).toBe(9500);
  expect(office.evaluate('CompanyFinance.monthlyBurn() - window.burnAfterFirst')).toBe(44000);
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(24000);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(11000);
  expect(office.errors).toEqual([]);
});

test('internal research yields to signed work when its daily development allocation is exhausted', async () => {
  await readyCompany();
  office.evaluate(`
    const research = sim.projects[0]; research.workDay = sim.day; research.workToday = 1000;
    startNewProject({id: 'client-job', name: '客戶合約', type: 'tech', work: 100, reward: 300000});
    const backend = sim.characters.find(ch => ch.id === 'backend'); backend.task = null;
    assignDeskTask(backend, {type: 'work'}, '履行客戶合約', 0.5);
    const tech = sim.characters.find(ch => ch.id === 'tech'); tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '履行客戶合約', 0.5);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.projectId')).toBe('client-job');
  expect(office.errors).toEqual([]);
});

test('an unprofitable product stops after the acquisition period and no longer creates daily bills', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]);
    for (let day = 89; day <= 132; day++) { sim.day = day; sim.gameTime = 20.5; tick(0); }
    sim.gameTime = 9; tick(0);
  `);
  expect(office.evaluate('sim.products[0].phase')).toBe('stopped');
  office.evaluate('CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.products[0].totalRevenue')).toBe(0);
  expect(office.evaluate('sim.products[0].totalOperatingCost')).toBe(110000);
  expect(office.errors).toEqual([]);
});

test('the product panel shows development investment and daily infrastructure costs separately', async () => {
  await readyCompany();
  office.evaluate('render();');
  const document = office.window.document;
  expect(document.getElementById('productList')?.textContent).toContain('訂閱工具網站');
  expect(document.getElementById('productList')?.textContent).toContain('3,000,000');
  expect(document.getElementById('productList')?.textContent).toContain('伺服器租用');
  expect(document.getElementById('productList')?.textContent).toContain('機房空間');
  expect(document.getElementById('companyProfit')?.textContent).toContain('本月損益');
  expect(office.errors).toEqual([]);
});

test('limited working capital prevents an internal launch and client advances cannot fund it', async () => {
  await readyCompany(1000000);
  expect(office.evaluate('sim.products.length')).toBe(0);
  office.evaluate(`
    sim.budget = 6000000; sim.finance.advances.reservedContract = 4000000;
    sim.day = 89; sim.gameTime = 9; tick(0);
  `);
  expect(office.evaluate('sim.products.length')).toBe(0);
  expect(office.evaluate('sim.finance.payables.some(item => item.category === "自研啟動")')).toBe(false);
});

test('the first daily statement reports no customers and the actual operating loss', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]);
    sim.day = 89; sim.gameTime = 20.5; CompanyFinance.accrueDay();
  `);
  expect(office.evaluate('sim.products[0].lastIncome')).toEqual({day: 89, customers: 0, revenue: 0, cost: 2500, profit: -2500});
  expect(office.evaluate('sim.products[0].lossDays')).toBe(1);
});

test('the boss can develop a game after the website, and reset clears both businesses', async () => {
  await readyCompany();
  office.evaluate(`
    completeProject(sim.projects[0]);
    sim.day = 176; sim.gameTime = 9; sim.budget = 20000000; tick(0); render();
  `);
  expect(office.evaluate('sim.products.map(product => product.catalogId)')).toEqual(['website', 'game']);
  expect(office.evaluate('sim.products[1].invested')).toBe(8000000);
  office.evaluate('resetAll();');
  expect(office.evaluate('sim.products')).toEqual([]);
  expect(office.window.document.getElementById('productList').children.length).toBe(0);
  expect(office.evaluate('sim.finance.revenueSources')).toEqual({contracts: 0, products: 0});
  expect(office.errors).toEqual([]);
});
