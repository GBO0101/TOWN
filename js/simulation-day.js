// SimulationDay owns its simulation phase.
const SimulationDay = (() => {
    function cleanSimulation() {
        sim.events = sim.events.slice(0, 500);
        sim.allMemories = sim.allMemories.slice(-200);
        sim.lateRecords = sim.lateRecords.slice(-100);
        const activeIds = new Set(sim.characters.filter(c => c.employment !== 'departed').map(c => c.id));
        for (const records of [sim.health, sim.punchRecords, sim.dailyPunch, sim.relationships]) {
            for (const id of Object.keys(records)) if (!activeIds.has(id)) delete records[id];
        }
        for (const relations of Object.values(sim.relationships)) {
            for (const id of Object.keys(relations)) if (!activeIds.has(id)) delete relations[id];
        }
        sim._lastCleanupDay = sim.day;
    }

    function startNextDay() {
        updateProjectWork();
        for (const ch of sim.characters) {
            if (ch.employment !== 'departed' && sim.dailyPunch[ch.id]?.punchedIn && !sim.dailyPunch[ch.id]?.punchedOut) punchOut(ch.id);
        }
        CompanyFinance.accrueDay();
        settleFinances(20.5);
        CompanyFinance.settle();
        for (const ch of sim.characters) EmployeeHealth.finishDay(ch);
        sim.day++;
        sim.gameTime = 7.5;
        sim._daysNoProject = sim.projects.length ? 0 : (sim._daysNoProject || 0) + 1;
        sim._lastPunchResetDay = sim.day;
        sim._bossScoldedToday = false;
        sim.lateToday = [];
        sim._hiredToday = false;
        sim._firedToday = false;
        sim._doorNotified = false;
        sim._otNotified = false;
        sim._activeBigEvent = null;
        sim.punchRecords = {};
        resetDailyPunch();
        for (const ch of sim.characters) {
            if (ch.employment === 'departed') continue;
            EmployeeHealth.beginDay(ch);
            CharacterCareer.review(ch);
            ch._afterWorkDone = false;
            ch._outsideLunch = false;
            sim.hasLeftToday[ch.id] = false;
            ch.isPresent = false;
            ch.pos = { ...DOOR_POS };
            ch.targetPos = { ...DOOR_POS };
            ch.state = 'gone';
            ch.currentAction = '準備上班';
            ch.task = null;
            scheduleNext(ch);
        }
        officeEvent('new_day', '新的一天開始，員工準備上班。');
        cleanSimulation(); // Overnight is skipped; perform the 06:00 cleanup before 07:30.
    }

    function settleFinances(hour) {
        if (hour < 9) return;
        CompanyFinance.collectReceivables();
        CompanyFinance.accrueLoans();
        CompanyFinance.borrow();
    }

    return { startNextDay, settleFinances };
})();
