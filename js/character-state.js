// Character memories, mood, relationships and employment lifecycle.
function addMem(charId, text, type) {
    const ch = sim.characters.find(x => x.id === charId);
    if (!ch) return;
    const m = {
        id: `${charId}_mem_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        text,
        type,
        day: sim.day,
        timeLabel: `${Math.floor(sim.gameTime)}:00`
    };
    ch.memories.push(m);
    sim.allMemories.push(m);
}

function updateMood(charId, delta) {
    const ch = sim.characters.find(x => x.id === charId);
    if (!ch) return;
    const nv = clamp((ch.mood.value ?? 0.5) + delta, 0, 1);
    ch.mood = moodFromValue(nv);
    sim._lastMoodDelta = {
        charId,
        delta,
        time: sim.gameTime
    };
}

function updateRel(c1, c2) {
    if (!sim.relationships[c1]) sim.relationships[c1] = {};
    if (!sim.relationships[c1][c2]) sim.relationships[c1][c2] = {
        familiarity: 0,
        sentiment: 0.5,
        interactions: 0
    };
    if (!sim.relationships[c2]) sim.relationships[c2] = {};
    if (!sim.relationships[c2][c1]) sim.relationships[c2][c1] = {
        familiarity: 0,
        sentiment: 0.5,
        interactions: 0
    };
    const r = sim.relationships[c1][c2];
    r.familiarity = Math.min(10, (r.familiarity || 0) + 0.2 + Math.random() * 0.3);
    r.sentiment = clamp((r.sentiment || 0.5) + (Math.random() - 0.3) * 0.08, 0, 1);
    r.interactions = (r.interactions || 0) + 1;
    sim.relationships[c2][c1].familiarity = r.familiarity;
    sim.relationships[c2][c1].sentiment = r.sentiment;
    sim.relationships[c2][c1].interactions = r.interactions;
}



function _findEmptyDesk() {
    const occupied = new Set(sim.characters.filter(c => c.employment !== 'departed').map(c => c.deskId));
    const allDesks = CompanyGrowth.desks();
    for (const d of allDesks) {
        if (!occupied.has(d)) return d;
    }
    return null; // no free desks
}



function hireCharacter(candId) {
    if (sim._hiredToday) return null;
    const src = CompanyGrowth.candidates().find(c => c.id === candId);
    if (!src || sim.characters.some(ch => ch.id === candId && ch.employment !== 'departed')) return null;
    const deskId = _findEmptyDesk();
    if (!deskId) {
        sim.events.unshift({
            id: sim.eventId++,
            day: sim.day,
            time: `${Math.floor(sim.gameTime%24)}:00`,
            type: 'note',
            chars: [{
                id: 'boss',
                name: '張志強',
                emoji: '👔',
                color: '#FF6B6B'
            }],
            text: '📋 人事通知：沒有空座位，暫時無法聘用新人。',
        });
        return null;
    }
    sim._hiredToday = true;
    const m = moodFromValue(0.55);
    const previousEmployee = sim.characters.find(ch => ch.id === src.id);
    const newChar = {
        ...src,
        career: previousEmployee?.career ? {...previousEmployee.career, promotions: [...previousEmployee.career.promotions]} : CharacterCareer.create(src),
        money: previousEmployee?.money ?? src.salary * 3,
        deskId,
        memories: src.initMems.map((t, i) => ({
            id: `${src.id}_init_${i}`,
            text: t,
            type: 'initial',
            day: sim.day,
            timeLabel: '到職'
        })),
        currentAction: '第一天報到',
        isPresent: true,
        employment: 'active',
        hireDay: sim.day,
        pos: {
            ...getDoorSpawnPos(src.id)
        },
        targetPos: {
            ...POS[deskId]
        },
        state: 'walking',
        mood: m,
        task: {
            type: 'walk_to_desk',
            endGT: sim.gameTime + 0.5
        },
        moveProgress: 1,
    };
    const previous = sim.characters.findIndex(ch => ch.id === newChar.id);
    if (previous >= 0) sim.characters.splice(previous, 1, newChar);
    else sim.characters.push(newChar);
    if (sim.company.vacancies[newChar.field]) sim.company.vacancies[newChar.field]--;
    sim.health[newChar.id] = previousEmployee?.healthAtDeparture ?? 1;
    sim.hasLeftToday[newChar.id] = false;
    sim.dailyPunch[newChar.id] = {punchedIn: false, punchedOut: false};
    sim.punchRecords[newChar.id] = {};
    sim.relationships[newChar.id] = {};
    for (const colleague of sim.characters.filter(ch => ch.id !== newChar.id && ch.employment !== 'departed')) {
        sim.relationships[colleague.id] ||= {};
        sim.relationships[colleague.id][newChar.id] = {familiarity: 0, sentiment: 0.5, interactions: 0};
        sim.relationships[newChar.id][colleague.id] = {familiarity: 0, sentiment: 0.5, interactions: 0};
    }
    EmployeeHealth.beginDay(newChar);
    if (EmployeeHealth.onLeave(newChar)) scheduleNext(newChar);
    else punchIn(newChar.id);
    sim.allMemories.push(...newChar.memories);

    // Notify all characters
    for (const c of sim.characters) {
        if (c.isPresent && c.id !== newChar.id) updateMood(c.id, 0.04);
    }
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${Math.floor(sim.gameTime%24)}:${Math.floor((sim.gameTime%24-Math.floor(sim.gameTime%24))*60).toString().padStart(2,'0')}`,
        type: 'hire',
        chars: sim.characters.filter(c => c.isPresent).map(c => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            color: c.color
        })),
        text: `📋 ${newChar.name}（${newChar.role}）今天報到。`,
    });

    // Intern gets auto-assigned mentor
    if (newChar.seniority === 'intern') {
        const veterans = sim.characters.filter(c => c.employment !== 'departed' && c.seniority === 'veteran' && c.id !== 'boss' && c.id !== newChar.id && sameField(c.role, newChar.role));
        if (veterans.length) {
            const mentor = pick(veterans);
            addMem(mentor.id, `被指派指導實習生 ${newChar.name}`, 'mentor');
            addMem(newChar.id, `${mentor.name} 是我的指導前輩`, 'mentor');
            sim.events.unshift({
                id: sim.eventId++,
                day: sim.day,
                time: `${Math.floor(sim.gameTime%24)}:00`,
                type: 'mentor_assign',
                chars: [{
                    id: mentor.id,
                    name: mentor.name,
                    emoji: mentor.emoji,
                    color: mentor.color
                }, {
                    id: newChar.id,
                    name: newChar.name,
                    emoji: newChar.emoji,
                    color: newChar.color
                }],
                text: `📚 ${mentor.name} 被指派指導實習生 ${newChar.name}。`,
            });
        }
    }
    return newChar;
}



function _departCharacter(charId, reason, reasonText) {
    const ch = sim.characters.find(c => c.id === charId);
    if (!ch || ch.employment === 'departed') return;
    contributeToProject(ch.id, ch.task);
    if (sim.dailyPunch[ch.id]?.punchedIn && !sim.dailyPunch[ch.id]?.punchedOut) punchOut(ch.id);
    ch.healthAtDeparture = sim.health[ch.id] ?? null;
    ch.employment = 'departed';
    ch.departDay = sim.day;
    ch.departReason = reason;
    if (ch.id !== 'boss') sim.company.vacancies[ch.field] = (sim.company.vacancies[ch.field] || 0) + 1;
    ch.task = null;
    CompanyFinance.closeEmployment(ch.id);
    if (sim._projectAttempt?.salesId === ch.id) sim._projectAttempt.salesId = null;

    ch.deskId = null;
    sim.departed.push({
        id: ch.id,
        name: ch.name,
        role: ch.role,
        emoji: ch.emoji,
        color: ch.color,
        reason,
        day: sim.day
    });
    // Remove from present
    ch.isPresent = false;
    ch.state = 'gone';
    // Mood effect on remaining
    for (const c of sim.characters) {
        if (c.employment !== 'departed' && c.isPresent) {
            const delta = reason === 'retired' ? 0.06 : -0.08;
            updateMood(c.id, delta);
        }
    }
    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: `${Math.floor(sim.gameTime%24)}:00`,
        type: reason,
        chars: [{
            id: ch.id,
            name: ch.name,
            emoji: ch.emoji,
            color: ch.color
        }],
        text: reasonText,
    });
}



function fireCharacter(charId) {
    if (sim._firedToday) return;
    sim._firedToday = true;
    _departCharacter(charId, 'fired',
        `📋 ${sim.characters.find(c=>c.id===charId)?.name||charId} 因工作表現不佳被辭退。`
    );
}



function layoffCharacter(charId) {
    const ch = sim.characters.find(ch => ch.id === charId && ch.employment !== 'departed');
    if (!ch) return;
    const serviceDays = Math.max(1, sim.day - (ch.hireDay || 1) + 1);
    const severance = Math.round(Math.min(ch.salary * 6, ch.salary * 0.5 * serviceDays / (ECONOMY.daysPerMonth * 12)));
    _departCharacter(charId, 'laid_off',
        `📋 ${sim.characters.find(c=>c.id===charId)?.name||charId} 因公司財務壓力被資遣。`
    );
    // Severance cost
    CompanyFinance.charge(severance, '資遣費概估', {kind: 'wage', employeeId: charId});
}



function retireCharacter(charId) {
    _departCharacter(charId, 'retired',
        `🎉 ${sim.characters.find(c=>c.id===charId)?.name||charId} 光榮退休，同事們為他歡送。`
    );
}



function convertIntern(charId) {
    const ch = sim.characters.find(c => c.id === charId);
    if (ch?.seniority === 'intern') return CharacterCareer.review(ch);
}
