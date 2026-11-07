// project-economy.js - Project management, budget, punch clock, client & supplier interactions
// Extracted from app.js Phase 3

/* global sim, pick, PROJECT_POOL, updateMood, addMem, setSpeech, CONTRIB_RATE, INVESTMENTS, CLIENTS, SUPPLIERS, getDoorSpawnPos, cellPos, CFG, DOOR_POS, NEWS */

// =============================================
// 3A. PROJECT MANAGEMENT
// =============================================

function pickProject(salesId = sim.characters.find(ch => ch.employment !== 'departed' && ch.field === 'sales')?.id) {
    const activeIds = new Set(sim.projects.map(project => project.id));
    const pool = PROJECT_POOL.filter(project => !activeIds.has(project.id) && canTakeProject(project))
        .map(project => ({...project, marketBudget: project.reward, ...projectEstimate(project, salesId), quoted: true}))
        .filter(project => project.reward <= project.marketBudget);
    if (!pool.length) return null;
    const project = {...pick(pool)};
    project.deadlineDays = projectDeadlineDays(project);
    project.deadlineDay = sim.day + project.deadlineDays;
    return project;
}

function startNewProject(proj, salesId) {
    const internal = proj?.source === 'product';
    if (!internal && sim.projects.filter(project => project.source !== 'product').length >= sim.maxProjects) return null;
    proj = proj || pickProject(salesId);
    if (!proj || sim.projects.some(project => project.id === proj.id)) return null;
    if (!Number.isFinite(proj.reward) || (internal ? proj.reward !== 0 : proj.reward <= 0) || !Number.isFinite(proj.work ?? 100) || (proj.work ?? 100) <= 0) return null;
    if (proj.quoted) {
        const ownerId = salesId === undefined ? proj.salesId : salesId;
        const cost = projectEstimate(proj, ownerId).estimatedCost;
        const commission = sim.characters.find(ch => ch.id === ownerId)?.commissionRate || 0;
        if (!canTakeProject(proj) || (proj.reward - cost) / proj.reward - commission < ECONOMY.minimumMargin) return null;
    }
    const project = {...proj, contractId: ++sim.nextProjectId, work: proj.work ?? 100, workDone: 0, progress: 0, contributions: {},
        status: 'active', startDay: sim.day, startTime: sim.gameTime,
        salesId: salesId === undefined ? proj.salesId || null : salesId};
    project.deadlineDays = internal ? (proj.maintenance ? PRODUCT_POLICY.maintenance.responseDays : Infinity) : projectDeadlineDays(project);
    project.deadlineDay = sim.day + project.deadlineDays;
    project.deposit = Math.round(project.reward * ECONOMY.depositRate);
    if (internal) {
        sim.projects.push(project);
        if (project.maintenance) officeEvent('product_maintenance', `「${project.name}」產生，需 ${project.work} 標準人時，第 ${project.deadlineDay} 天內完成；無報酬，逾期將流失客戶`);
        else officeEvent('product_development', `自研「${project.name}」開始，需投入 ${project.work} 標準人時，開發中沒有營運收入`);
        sim._projectUpdated = true;
        return project;
    }
    const estimate = projectEstimate(project, project.salesId);
    project.estimatedCost = estimate.estimatedCost;
    project.estimatedCommission = Math.round(project.reward * (sim.characters.find(ch => ch.id === project.salesId)?.commissionRate || 0));
    project.estimatedProfit = project.reward - project.estimatedCost - project.estimatedCommission;
    sim.finance.advances[project.id] = project.deposit;
    CompanyFinance.receive(project.deposit);
    sim.projects.push(project);
    officeEvent('project_start', `合約「${project.name}」成立：總價 $${project.reward.toLocaleString()}、訂金 $${project.deposit.toLocaleString()}，預估 ${project.work} 人時，期限 ${project.deadlineDays} 個營業日`);
    sim._projectUpdated = true;
    return project;
}

function completeProject(proj) {
    if (!sim.projects.includes(proj) || proj.status === 'completed' || proj.status === 'failed') return;
    proj.status = 'completed';
    proj.progress = 100;
    proj.workDone = proj.work || 100;
    if (proj.source === 'product') { PassiveProducts.complete(proj); return; }
    const deposit = sim.finance.advances[proj.id] || 0;
    delete sim.finance.advances[proj.id];
    CompanyFinance.recognizeRevenue(proj.reward);
    const amount = Math.max(0, proj.reward - deposit);
    const sales = sim.characters.find(ch => ch.id === proj.salesId);
    const commission = sales ? Math.round(proj.reward * (sales.commissionRate || 0)) : 0;
    if (amount) sim.finance.receivables.push({id: sim.finance.nextId++, projectId: proj.id, projectName: proj.name,
        amount, dueDay: sim.day + ECONOMY.receivableDays, employeeId: sales?.id || null, commission});
    else if (commission) CompanyFinance.charge(commission, '業務抽成', {kind: 'commission', employeeId: sales.id});
    sim.finance.reputation = Math.min(1, sim.finance.reputation + 0.05);
    for (const ch of sim.characters.filter(ch => ch.isPresent)) updateMood(ch.id, 0.06);
    addMem('boss', `${proj.name}交付，收入認列 $${proj.reward.toLocaleString()}，尾款尚待收取`, 'project');
    officeEvent('project_done', `專案「${proj.name}」交付，收入認列 $${proj.reward.toLocaleString()}；尾款 $${amount.toLocaleString()} 列入應收，第 ${sim.day + ECONOMY.receivableDays} 天到期`);
    sim.projects = sim.projects.filter(project => project !== proj);
    finishProjectWork(proj);
    sim._projectUpdated = true;
}

function failProject(proj) {
    if (!sim.projects.includes(proj) || proj.status === 'completed' || proj.status === 'failed') return;
    proj.status = 'failed';
    const deposit = sim.finance.advances[proj.id] || 0;
    delete sim.finance.advances[proj.id];
    CompanyFinance.charge(deposit, '退還訂金', {kind: 'liability'});
    const penalty = Math.round(proj.reward * ECONOMY.failurePenaltyRate);
    CompanyFinance.charge(penalty, '專案賠償');
    sim.finance.reputation = Math.max(0, sim.finance.reputation - 0.1);
    for (const ch of sim.characters.filter(ch => ch.isPresent)) updateMood(ch.id, -0.08);
    addMem('boss', `${proj.name}未能交付，退還訂金並列賠償費用`, 'project_fail');
    officeEvent('project_fail', `專案「${proj.name}」未能交付：退還訂金 $${deposit.toLocaleString()}、合約賠償 $${penalty.toLocaleString()}，列入當日付款`);
    sim.projects = sim.projects.filter(project => project !== proj);
    finishProjectWork(proj);
    sim._projectUpdated = true;
}


// =============================================
// 3B. TIME CLOCK / PUNCH SYSTEM (刷卡系統)
// =============================================

function punchIn(charId) {
    if (!sim.punchRecords[charId]) sim.punchRecords[charId] = {};
    if (!sim.dailyPunch[charId]) sim.dailyPunch[charId] = {};
    const record = sim.punchRecords[charId];
    // 業務如果已經 punchIn 過，第二次不重複記錄
    if (sim.dailyPunch[charId]?.punchedIn) return;

    record.in = sim.gameTime;
    record.overtimeHours = 0;
    sim.dailyPunch[charId].punchedIn = true;
    sim.dailyPunch[charId].punchedOut = false;
    const ch = sim.characters.find(c => c.id === charId);
    if (ch) {
        setSpeech(ch, '💳刷卡上班');
        // Record late if after 08:00
        const hour = sim.gameTime % 24;
        const alreadyLate = sim.lateRecords.some(r => r.charId === charId && r.date === `${sim.day}`);
        const lateMinutes = Math.round((hour - 8.0) * 60);
        if (lateMinutes > 0 && ch.hireDay !== sim.day && ch.id !== 'boss' && professionKey(ch) !== 'sales' && !alreadyLate) {
            if (!sim.lateToday.includes(charId)) sim.lateToday.push(charId);
            sim.lateRecords.push({
                charId,
                name: ch.name,
                punchTime: hour,
                lateMinutes,
                fine: 0,
                date: `${sim.day}`,
            });
            sim.events.unshift({
                id: sim.eventId++,
                day: sim.day,
                time: `${Math.floor(hour)}:${Math.floor((hour-Math.floor(hour))*60).toString().padStart(2,'0')}`,
                type: 'note',
                chars: [{
                    id: ch.id,
                    name: ch.name,
                    emoji: ch.emoji,
                    color: ch.color
                }],
                text: `${ch.name} 遲到 ${lateMinutes} 分鐘，已記錄出勤，不做懲罰性扣款`,
            });
        }
    }
}

function punchOut(charId) {
    if (!sim.punchRecords[charId]) return;
    const record = sim.punchRecords[charId];
    if (!record.in) return;
    record.out = sim.gameTime;
    sim.dailyPunch[charId].punchedOut = true;
    // Calculate overtime
    const workEnd = 17.5; // 17:30 standard end
    if (record.out > workEnd) {
        record.overtimeHours = record.out - workEnd;
    }
    // Notify
    const ch = sim.characters.find(c => c.id === charId);
    if (ch) {
        const ot = record.overtimeHours > 0 ? ` (加班 ${record.overtimeHours.toFixed(1)}h)` : '';
        setSpeech(ch, `🖐️下班${ot}`);
    }
    // Calculate overtime pay
    calculateOvertimePay(charId);
}

function calculateOvertimePay(charId) {
    const record = sim.punchRecords[charId];
    const ch = sim.characters.find(c => c.id === charId);
    if (!ch || !record || record.overtimeHours <= 0) return;
    const hourlyRate = ch.salary / 240;
    let otPay = 0;
    const otHours = record.overtimeHours;
    if (otHours <= 2) {
        otPay = otHours * hourlyRate * 4 / 3;
    } else {
        otPay = 2 * hourlyRate * 4 / 3 + (otHours - 2) * hourlyRate * 5 / 3;
    }
    otPay = Math.ceil(otPay);
    const additionalPay = Math.max(0, otPay - (record.overtimeAccrued || 0));
    if (!additionalPay) return;
    // 先列應付，隨月薪實際入帳。
    CompanyFinance.charge(additionalPay, '加班費', {kind: 'wage', employeeId: charId, dueDay: CompanyFinance.payday()});
    record.overtimeAccrued = otPay;
    // Record in event
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${Math.floor(sim.gameTime%24)}:00`,
        type: 'note',
        chars: [{
            id: ch.id,
            name: ch.name,
            emoji: ch.emoji,
            color: ch.color
        }],
        text: `💰 ${ch.name} 加班 ${otHours.toFixed(1)}h，加班費累計 $${otPay.toLocaleString()}（本次列帳 $${additionalPay.toLocaleString()}）`,
    });
    // Mood effect: overtime tired but extra money
    updateMood(ch.id, -0.05);
    addMem(ch.id, `加班 ${otHours.toFixed(1)}h，應領加班費增加 $${additionalPay.toLocaleString()}，隨月薪支付`, 'overtime');
}

// Reset daily punch records at day start
function resetDailyPunch() {
    for (const ch of sim.characters) {
        if (ch.employment === 'departed') continue;
        sim.dailyPunch[ch.id] = {
            punchedIn: false,
            punchedOut: false
        };
    }
}

// =============================================
// 6B. LOAN / INVEST
// =============================================

function bossTakeLoan(requested) { return CompanyFinance.borrow(requested); }

function bossInvest() {
    if (sim._lastBossInvestDay && sim.day - sim._lastBossInvestDay < ECONOMY.daysPerMonth) return null;
    const option = pick(INVESTMENTS);
    if (CompanyFinance.available() < CompanyFinance.monthlyBurn() + option.cost) return null;
    CompanyFinance.charge(option.cost, option.name);
    sim.finance.programs.push({...option, untilDay: sim.day + ECONOMY.daysPerMonth});
    sim._lastBossInvestDay = sim.day;
    officeEvent('business_investment', '投入「' + option.name + '」$' + option.cost.toLocaleString() + '，效益用於後續營運，不產生即時投資獲利');
    return option;
}

// =============================================
// 7C. CLIENT SYSTEM
// =============================================

/** Spawn a random client at the door who walks to the meeting area */
function spawnClient(onArrive) {
    const data = pick(CLIENTS);
    const gt = sim.gameTime;
    const hh = Math.floor(gt);
    const mm = Math.floor((gt - hh) * 60);
    sim.client = {
        ...data,
        pos: {
            ...getDoorSpawnPos(data.id)
        },
        targetPos: cellPos('meeting', `client_${sim.day}_${sim._clientVisitCount || 0}`),
        state: 'walking',
        currentAction: '🚶訪客中走進會議室',
        task: {
            type: 'walk_to_meeting',
            endGT: gt + 0.6
        },
        moveProgress: 0,
        _onArrive: onArrive || null, // callback when client reaches meeting
    };
    sim._clientVisitCount = (sim._clientVisitCount || 0) + 1;
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`,
        type: 'client_arrive',
        chars: [{
            id: data.id,
            name: data.name,
            emoji: data.emoji,
            color: data.color
        }],
        text: `🤝 ${data.name}（${data.emoji}）來訪張董談合作`,
    });
}

/** Despawn the client (walk to door then remove) */
function despawnClient() {
    if (!sim.client) return;
    const gt = sim.gameTime;
    sim.client.targetPos = {
        ...DOOR_POS
    };
    sim.client.state = 'walking';
    sim.client.currentAction = '🚶離開';
    sim.client.task = {
        type: 'walk_to_door',
        endGT: gt + 0.4
    };
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${Math.floor(sim.gameTime%24)}:00`,
        type: 'client_leave',
        chars: [{
            id: sim.client.id,
            name: sim.client.name,
            emoji: sim.client.emoji,
            color: sim.client.color
        }],
        text: `👋 ${sim.client.name} 滿意離開公司`,
    });
}

/** Tick logic for the client (walking, meeting, leaving) */
function tickClient(dt) {
    if (!sim.client) return;
    const cl = sim.client;
    // Walking animation
    if (cl.state === 'walking' && cl.targetPos) {
        const dx = cl.targetPos.x - cl.pos.x;
        const dy = cl.targetPos.y - cl.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
            cl.pos = {...cl.targetPos};
            // Arrived at destination
            if (cl.task && cl.task.type === 'walk_to_door') {
                // Reached door → despawn
                sim.client = null;
                sim._clientVisitCount = 0;
                return;
            }
            // Arrived at meeting → start meeting timer now
            cl.state = 'sitting';
            cl.currentAction = '👔與張董開會';
            cl.task = {
                type: 'big_client',
                endGT: sim.gameTime + 0.8 + Math.random() * 0.4
            };
            // If this client visit was triggered by the boss taking a project, add it now
            if (typeof cl._onArrive === 'function') {
                cl._onArrive();
                cl._onArrive = null;
            }
        } else {
            const speedScale = Math.max(1, CFG.speed / 0.04);
            const step = Math.min(1, 45 * dt * speedScale);
            cl.pos.x += (dx / dist) * step;
            cl.pos.y += (dy / dist) * step;
        }
    }
    // Meeting ended → client leaves
    if (cl.task && cl.task.type === 'big_client' && cl.task.endGT <= sim.gameTime) {
        despawnClient();
    }
}

// =============================================
// 7D. SUPPLIER SYSTEM
// =============================================

/** Spawn a supplier at the door who walks to boss office to negotiate */
function spawnSupplier() {
    const data = pick(SUPPLIERS);
    const gt = sim.gameTime;
    const hh = Math.floor(gt);
    const mm = Math.floor((gt - hh) * 60);
    sim.supplier = {
        ...data,
        pos: {
            ...getDoorSpawnPos(data.id)
        },
        targetPos: cellPos('boss_desk', `supplier_${sim.day}`),
        state: 'walking',
        currentAction: '🚶前往辦公室',
        task: {
            type: 'walk_to_boss',
            endGT: gt + 0.6 + Math.random() * 0.3
        },
        moveProgress: 0,
    };
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`,
        type: 'supplier_arrive',
        chars: [{
            id: data.id,
            name: data.name,
            emoji: data.emoji,
            color: data.color
        }],
        text: `📦 ${data.name}（${data.company}）來訪供應商辦公室洽談合約`,
    });
}

/** Despawn the supplier (walk to door then remove) */
function despawnSupplier() {
    if (!sim.supplier) return;
    const gt = sim.gameTime;
    sim.supplier.targetPos = {
        ...DOOR_POS
    };
    sim.supplier.state = 'walking';
    sim.supplier.currentAction = '🚶離開';
    sim.supplier.task = {
        type: 'walk_to_door',
        endGT: gt + 0.4
    };
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${Math.floor(sim.gameTime%24)}:00`,
        type: 'supplier_leave',
        chars: [{
            id: sim.supplier.id,
            name: sim.supplier.name,
            emoji: sim.supplier.emoji,
            color: sim.supplier.color
        }],
        text: `👋 ${sim.supplier.name}（${sim.supplier.company}）離開公司`,
    });
}

/** Negotiate and create a new supplier contract */
function finalizeSupplierContract() {
    if (!sim.supplier) return;
    const gt = sim.gameTime;
    const hh = Math.floor(gt);
    const mm = Math.floor((gt - hh) * 60);

    const modifier = -0.05 + Math.random() * 0.10;
    const duration = ECONOMY.daysPerMonth * 3;
    const costCategory = sim.supplier.id === 'supplier1' ? '雲端' : sim.supplier.id === 'supplier2' ? '水電' : '辦公耗材';
    const supplierName = sim.supplier.name;
    const company = sim.supplier.company;
    const desc = sim.supplier.desc;

    sim.supplierContract = {
        startDay: sim.day,
        duration: duration,
        modifier: modifier,
        costCategory,
        supplierName: supplierName,
        company: company,
        desc: desc,
    };

    const direction = modifier > 0 ? '上漲' : '調降';
    const pct = (Math.abs(modifier) * 100).toFixed(1);
    const costDir = modifier > 0 ? '⬆️' : '⬇️';

    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`,
        type: 'supplier_contract',
        chars: [{
            id: 'boss',
            name: '張董',
            emoji: '🧑‍💼',
            color: '#FF6B6B'
        }, {
            id: sim.supplier.id,
            name: supplierName,
            emoji: sim.supplier.emoji,
            color: sim.supplier.color
        }],
        text: `${costDir} ${supplierName}（${company}）簽約更換供應商「${desc}」，費用${direction} ${pct}%（持續 ${duration} 天）`,
    });
}

/** Tick logic for the supplier (walking, negotiating, leaving) */
function tickSupplier(dt) {
    if (!sim.supplier) return;
    const sp = sim.supplier;
    // Walking animation
    if (sp.state === 'walking' && sp.targetPos) {
        const dx = sp.targetPos.x - sp.pos.x;
        const dy = sp.targetPos.y - sp.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
            sp.pos.x = sp.targetPos.x;
            sp.pos.y = sp.targetPos.y;
            // Arrived at destination
            if (sp.task && sp.task.type === 'walk_to_door') {
                // Reached door → despawn
                sim.supplier = null;
                return;
            }
            // Arrived at boss office → start negotiation
            sp.state = 'sitting';
            sp.currentAction = '🧑‍💼與張董談合約';
            sp.task = {
                type: 'supplier_negotiate',
                endGT: sim.gameTime + 0.5 + Math.random() * 0.5
            };
        } else {
            const speedScale = Math.max(1, CFG.speed / 0.04);
            const step = Math.min(1, 45 * dt * speedScale);
            sp.pos.x += (dx / dist) * step;
            sp.pos.y += (dy / dist) * step;
        }
    }
    // Negotiation ended → finalize contract, then leave
    if (sp.task && sp.task.type === 'supplier_negotiate' && sp.task.endGT <= sim.gameTime) {
        finalizeSupplierContract();
        despawnSupplier();
    }
}
