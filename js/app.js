// Application state, initialization and UI controls.
let _animFrame = null;
let _tickInterval = null;
let sim = {
    gameTime: 7.5, // hours, decimal
    day: 1,
    running: true,
    paused: false,
    overtime: true,
    budget: ECONOMY.startingCash, // 公司現金，單位為元
    finance: CompanyFinance.createState(),
    company: CompanyGrowth.createState(),
    dailyOpCost: 0, // computed each day
    dailyExpenses: {},
    lastSettlement: null,
    _lastSettlementDay: 0,
    characters: [],
    events: [],
    allMemories: [],
    relationships: {},
    hasLeftToday: {},
    lastEventTime: {},
    eventId: 0,
    _doorNotified: false,
    _otNotified: false,
    _bigEventDay: -99,
    _bigEventCooldown: 0,
    projects: [],
    products: [],
    productDecision: '等待營運穩定後評估自研',
    _lastProductReviewDay: 0,
    _nextProductDay: PRODUCT_POLICY.startDay,
    lastProjectResult: null,
    nextProjectId: 0,
    maxProjects: 3,
    _projectCooldown: 0,
    _lastBudgetDay: 0,
    _nightSkip: true, // fast-forward when everyone has left
    _doorWasOpen: false, // track if door was opened for status rendering
    departed: [], // characters who left (fired/laid off/retired)
    _hiredToday: false, // prevent multiple hires in one day
    _firedToday: false, // prevent multiple fires in one day
    _internDay: 0, // track intern start day for conversion
    client: null, // current visiting client (or null)
    _clientVisitCount: 0,
    supplier: null, // current visiting supplier (or null)
    supplierContract: null, // { startDay, duration, modifier, supplierName, company, desc }
    _lastSupplierVisitDay: 0,
    lateRecords: [], // { charId, name, punchTime, lateMinutes, fine }
    loans: [], // 借款本金、年利率、分期月數與下次到期日
};

// =============================================
// INIT — reset all sim state for a new game
// =============================================
function initSim() {
    sim.gameTime = 7.5;
    sim.day = 1;
    sim.running = true;
    sim.paused = false;
    sim.overtime = true;
    sim.overtimePolicy = 'strict';
    sim.speed = 1;
    CFG.speed = 0.08;
    sim.budget = ECONOMY.startingCash;
    sim.finance = CompanyFinance.createState();
    sim.company = CompanyGrowth.createState();
    sim.dailyOpCost = 0;
    sim.dailyExpenses = {};
    sim.lastSettlement = null;
    sim._lastSettlementDay = 0;
    sim.projects = [];
    sim.products = [];
    sim.productDecision = `自研為中後期投資，最早第 ${PRODUCT_POLICY.startDay} 天評估，另須備妥啟動費與三個月營運準備`;
    sim._lastProductReviewDay = 0;
    sim._nextProductDay = PRODUCT_POLICY.startDay;
    sim.lastProjectResult = null;
    sim.nextProjectId = 0;
    sim.maxProjects = 3;
    sim._projectCooldown = 0;
    sim._lastPunchResetDay = sim.day;
    sim._lastBudgetDay = 0;
    sim._lastSalaryDay = 0;
    sim._lastCleanupDay = 0;
    sim._forcedProjectDay = 0;
    sim._daysNoProject = 0;
    sim._nightSkip = false;
    sim._doorWasOpen = false;
    sim._doorNotified = false;
    sim._otNotified = false;
    sim._bigEventDay = -99;
    sim._bigEventCooldown = 0;
    sim.departed = [];
    sim._hiredToday = false;
    sim._firedToday = false;
    sim._internDay = 0;
    sim.client = null;
    sim._clientVisitCount = 0;
    sim.supplier = null;
    sim.supplierContract = null;
    sim._lastSupplierVisitDay = 0;
    sim.lateRecords = [];
    sim.loans = [];
    sim.events = [];
    sim.allMemories = [];
    sim.hasLeftToday = {};
    sim.lastEventTime = {};
    sim.eventId = 0;
    sim._activeBigEvent = null;
    sim._paydayNotified = false;
    sim._bossScoldedToday = false;
    sim.lateToday = [];
    sim._budgetChanged = false;
    sim._lastBossInvestDay = 0;
    sim.health = {};
    // 打卡記錄
    sim.punchRecords = {}; // { charId: { in: gameTime, out: gameTime, overtimeHours: 0 } }
    sim.dailyPunch = {}; // { charId: { punchedIn: bool, punchedOut: bool } }
    sim._budgetDirection = null;
    sim._projectUpdated = false;
    sim._lastMoodDelta = null;
    sim._bossEvalDay = 0;
    sim._bossPolicyDay = 0;
    sim._bossDrinkingDay = 0;
    sim._projectAttempt = null;
    sim._salesCommissions = {};

    sim.characters = CHARACTERS.map(c => {
        const m = moodFromValue(c.initMood ?? 0.6);
        return {
            ...c,
            employment: 'active',
            memories: c.initMems.map((t, i) => ({
                id: `${c.id}_init_${i}`,
                text: t,
                type: 'initial',
                day: 0,
                timeLabel: '初始記憶'
            })),
            currentAction: '準備上班',
            isPresent: false, // Start outside, will arrive at 08:00
            pos: {
                ...getDoorSpawnPos(c.id)
            }, // Start at door (spread)
            targetPos: {
                ...DOOR_POS
            },
            state: 'gone',
            mood: m,
            task: null,
            speech: null,
            currentThought: null,
            _afterWorkDone: false,
            _afterWorkEvent: null,
            moveProgress: 1,
            _day1WentOut: false,
        };
    });

    for (const c of sim.characters) { sim.health[c.id] = 1; c.career = CharacterCareer.create(c); EmployeeHealth.beginDay(c); }
    sim.allMemories = sim.characters.flatMap(c => c.memories);

    // Relationships
    sim.relationships = {};
    for (const c of sim.characters) {
        sim.relationships[c.id] = {};
        for (const o of sim.characters) {
            if (c.id !== o.id) {
                sim.relationships[c.id][o.id] = {
                    familiarity: 0.3 + Math.random() * 0.8,
                    sentiment: 0.4 + Math.random() * 0.4,
                    interactions: 0
                };
            }
        }
    }

    // Schedule first tasks
    for (const c of sim.characters) {
        scheduleNext(c);
    }
    // Generate initial thoughts
    for (const c of sim.characters) {
        c.currentThought = generateThought(c);
    }
}

function togglePause() {
    sim.paused = !sim.paused;
    document.getElementById('pauseBtn').textContent = sim.paused ? '▶ 繼續' : '⏸ 暫停';
    document.getElementById('pauseBtn').classList.toggle('active', sim.paused);
    notify(sim.paused ? '模擬已暫停' : '模擬繼續', 1500);
}

function animLoop() {
    render();
    _animFrame = requestAnimationFrame(animLoop);
}

function startLoops() {
    if (_animFrame !== null) cancelAnimationFrame(_animFrame);
    if (_tickInterval !== null) clearInterval(_tickInterval);
    _animFrame = requestAnimationFrame(animLoop);
    _tickInterval = setInterval(() => {
        for (let i = 0; i < (sim.speed || 1); i++) tick(1 / CFG.tickHz);
    }, 1000 / CFG.tickHz);
}

function resetAll() {
    initSim();
    document.getElementById('pauseBtn').textContent = '⏸ 暫停';
    document.getElementById('pauseBtn').classList.remove('active');
    document.getElementById('speedDisplay').textContent = '1×';
    document.getElementById('memoryModal').classList.add('hidden');
    document.getElementById('charPopup').classList.add('hidden');
    document.getElementById('latePopup').classList.add('hidden');
    startLoops();
    render();
    OfficeLayout.center(document.getElementById('officeScene'));
    notify('辦公室已重置。', 2000);
}

function boot() {
    initSim();
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('charactersLayer').addEventListener('click', event => {
        const character = event.target.closest('.office-char[data-char-id]');
        if (character) openCharPopup(character.dataset.charId);
    });
    document.getElementById('memoryModal').addEventListener('click', event => {
        if (event.target === event.currentTarget) closeModal();
    });
    document.getElementById('charPopupClose').addEventListener('click', closeCharPopup);
    document.getElementById('popupMemoryBtn').addEventListener('click', () => openModal(_popupCharId));
    document.addEventListener('keydown', event => {
        const memoryOpen = !document.getElementById('memoryModal').classList.contains('hidden');
        if (memoryOpen && event.key === 'Tab') {
            event.preventDefault();
            document.getElementById('modalCloseBtn').focus();
        }
        if (event.key !== 'Escape') return;
        if (memoryOpen) closeModal();
        else if (!document.getElementById('charPopup').classList.contains('hidden')) closeCharPopup();
        else if (!document.getElementById('latePopup').classList.contains('hidden')) {
            document.getElementById('latePopup').classList.add('hidden');
            document.getElementById('timeClock').focus();
        }
    });
    document.getElementById('speedDisplay').addEventListener('click', event => {
        const speeds = [1, 2, 3, 5, 10];
        sim.speed = speeds[(speeds.indexOf(sim.speed) + 1) % speeds.length];
        event.currentTarget.textContent = sim.speed + '×';
    });
    initFurniture();
    PanelView.init();
    render();
    startLoops();
}

document.addEventListener('DOMContentLoaded', boot);
