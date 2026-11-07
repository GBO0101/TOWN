/* 動作優先順序：離職／已下班、進行中任務、出勤、午餐、休息、職業工作、加班或下班。 */
const CharacterRules = (() => {
    const breakTypes = ['coffee', 'toilet', 'stretch', 'gossip', 'break'];

    function daily(ch) {
        if (ch.behavior?.day !== sim.day) ch.behavior = {day: sim.day,
            nextBreakAt: 9.5 + (1 - (ch.traits?.breakiness ?? 0.3)),
            lunchPlan: null, lunchDone: false, overtimeUntil: null, pursuedDeal: false};
        return ch.behavior;
    }

    function offDuty(ch, label) {
        ch.task = null; ch.isPresent = false; ch.state = 'gone'; ch.currentAction = label;
    }

    function enter(ch, returning = false) {
        ch.isPresent = true; ch.pos = {...getDoorSpawnPos(ch.id)}; ch.targetPos = {...POS[ch.deskId]};
        ch.state = 'walking'; ch._outsideLunch = false;
        ch.currentAction = returning ? '返回公司後前往座位' : '進公司後前往座位';
        ch.task = {type: 'walk_to_desk', reason: returning ? 'return' : 'arrival', endGT: sim.gameTime};
        if (!sim.dailyPunch[ch.id]?.punchedIn) punchIn(ch.id);
    }

    function move(ch, type, target, text, duration, extra = {}) {
        contributeToProject(ch.id, ch.task);
        ch.targetPos = {...target}; ch.currentAction = text; ch.state = 'walking';
        ch.task = {type, actionText: text, _duration: duration, ...extra};
    }

    function leave(ch) {
        move(ch, 'walk_to_door', DOOR_POS, '前往大門打卡下班', 0.01);
        delete ch.task._duration;
        ch.task.endGT = sim.gameTime;
    }

    function work(ch, until = 17.5) {
        const duration = Math.min(0.5, until - sim.gameTime);
        if (duration <= 0) { leave(ch); return; }
        const overtime = sim.gameTime >= 17.5;
        const professional = !overtime && Math.random() < 0.6 && pickRoleAction(ch, duration);
        if (!professional) assignDeskTask(ch, {type: overtime ? 'overtime' : 'work'}, overtime ? '處理核准加班工作' : '處理工作項目', duration);
        ch.task.returnByGT = until;
        if (Number.isFinite(ch.task.endGT)) ch.task.endGT = Math.min(ch.task.endGT, until);
        ch.currentThought = generateThought(ch);
    }

    function lunch(ch, state) {
        if (!state.lunchPlan) state.lunchPlan = Math.random() < (ch.traits?.workEthic ?? 0.7) * 0.5 ? 'work' : 'meal';
        if (state.lunchPlan === 'work' || state.lunchDone) { work(ch); return; }
        const duration = Math.min(0.75, CFG.lunchEnd - sim.gameTime);
        if (ch.traits?.lunchStyle === 'out' && duration >= 0.25) {
            move(ch, 'lunch', DOOR_POS, '外出吃午餐', duration, {isOutside: true, returnByGT: CFG.lunchEnd, maxProgress: duration, progress: 0});
        } else if (ch.traits?.lunchStyle === 'sofa') move(ch, 'lunch', cellPos('sofa', ch.id), '在休息區吃午餐', duration);
        else assignDeskTask(ch, {type: 'lunch'}, '在座位吃午餐', duration);
    }

    function rest(ch, state) {
        state.nextBreakAt = sim.gameTime + 1.5 + (1 - (ch.traits?.breakiness ?? 0.3));
        const options = ['coffee', 'toilet', 'stretch'];
        if ((ch.traits?.socialBattery ?? 0.5) > 0.7) options.push('gossip');
        const type = pick(options);
        const targets = {coffee: POS.coffee, toilet: POS[Math.random() < 0.5 ? 'toilet1' : 'toilet2'], stretch: POS[ch.deskId], gossip: cellPos('sofa', ch.id)};
        const texts = {coffee: '茶水休息', toilet: '前往廁所', stretch: '在座位旁伸展', gossip: '休息時與同事交流'};
        move(ch, type, targets[type], texts[type], type === 'stretch' ? 0.1 : 0.2, {arrivalState: type === 'coffee' || type === 'stretch' ? 'standing' : 'sitting'});
    }

    function schedule(ch) {
        if (ch.employment === 'departed') { offDuty(ch, '已離職'); return; }
        if (EmployeeHealth.onLeave(ch)) { offDuty(ch, '健康休假'); return; }
        contributeToProject(ch.id, ch.task);
        const hour = sim.gameTime;
        const state = daily(ch);
        if (sim.hasLeftToday[ch.id]) { offDuty(ch, '已下班'); return; }
        const pending = sim._projectAttempt;
        if (hour >= 8 && hour < 17.5 && !ch.isPresent && ch.task?.type === 'outside_leisure' &&
            professionKey(ch) === 'sales' && pending && (!pending.salesId || pending.salesId === ch.id)) { enter(ch, true); return; }
        if (ch.task && (ch.state === 'walking' || Number.isFinite(ch.task.endGT) && ch.task.endGT > hour)) return;
        ch.task = null;
        const earlyBoss = ch.id === 'boss' && sim.day === 1 && hour >= 7.5;
        if (hour < 8 && !earlyBoss) { offDuty(ch, '準備上班'); return; }
        if (hour >= 20) {
            if (ch.isPresent) leave(ch);
            else { if (sim.dailyPunch[ch.id]?.punchedIn && !sim.dailyPunch[ch.id]?.punchedOut) punchOut(ch.id); sim.hasLeftToday[ch.id] = true; offDuty(ch, '已下班'); }
            return;
        }
        if (!ch.isPresent) { enter(ch, !!sim.dailyPunch[ch.id]?.punchedIn || !!ch._outsideLunch); return; }
        if (hour >= 17.5) {
            if (state.overtimeUntil === null) {
                const willing = (ch.mood.value ?? 0.5) >= 0.4 && (sim.health[ch.id] ?? 1) >= HEALTH_POLICY.overtimeMinimum && (ch.traits?.workEthic ?? 0.7) >= 0.65;
                state.overtimeUntil = sim.overtimePolicy !== 'strict' && sim.projects.some(project => project.source !== 'product') && willing ? (sim.overtimePolicy === 'flexible' ? 19.5 : 18.5) : 0;
            }
            if (!sim.projects.length || hour >= state.overtimeUntil || (sim.health[ch.id] ?? 1) < HEALTH_POLICY.overtimeMinimum) leave(ch);
            else work(ch, state.overtimeUntil);
            return;
        }
        if (isLunchTime(hour)) { lunch(ch, state); return; }
        if (ch.id === 'boss' && sim.day >= 2 && hour >= 9 && hour < 14 && !sim.projects.some(project => project.source !== 'product') && !state.pursuedDeal) {
            state.pursuedDeal = true;
            move(ch, 'pursue_deal', DOOR_POS, '外出洽談合作', 1.5, {isOutside: true, maxProgress: 1.5, progress: 0});
            officeEvent('note', `${ch.name}外出洽談合作，本日安排一次`, [ch]);
            return;
        }
        if (hour >= state.nextBreakAt && hour < 17.25) { rest(ch, state); return; }
        work(ch);
    }

    function complete(ch, task) {
        const state = daily(ch);
        if (task.type === 'lunch') state.lunchDone = true;
        if (breakTypes.includes(task.type) || task.type === 'lunch') state.nextBreakAt = sim.gameTime + 1.5 + (1 - (ch.traits?.breakiness ?? 0.3));
        if (!task.isOutside) return;
        if (sim.gameTime >= 17.5) {
            if (sim.dailyPunch[ch.id]?.punchedIn && !sim.dailyPunch[ch.id]?.punchedOut) punchOut(ch.id);
            sim.hasLeftToday[ch.id] = true; offDuty(ch, '已下班');
        } else enter(ch, true);
    }

    function canDispatchSales(ch, hour) {
        if (professionKey(ch) !== 'sales' || ch.employment === 'departed' || EmployeeHealth.onLeave(ch) || !ch.isPresent || sim.hasLeftToday[ch.id] ||
            ch.state === 'walking' || hour < 8.5 || hour > 14 || !POS[ch.deskId] || distance(ch.pos, POS[ch.deskId]) >= 0.5) return false;
        return !ch.task || ch.task.type === 'break' || isProjectWorkTask(ch.task);
    }

    function status(ch) {
        const task = ch.task;
        if (ch.employment === 'departed') return {key: 'departed', label: ch.departReason === 'retired' ? '已退休' : '已離職'};
        if (EmployeeHealth.onLeave(ch)) return {key: 'health_leave', label: '健康休假'};
        if (!ch.isPresent) {
            if (task?.isOutside) return {key: task.type === 'lunch' ? 'lunch' : 'outside', label: task.type === 'lunch' ? '外出午餐' : '業務外勤'};
            return {key: 'off_duty', label: sim.hasLeftToday[ch.id] ? '已下班' : '未到班'};
        }
        if (ch.state === 'walking') {
            if (task?.type === 'walk_to_door') return {key: 'leaving', label: '前往下班'};
            if (task?.type === 'walk_to_desk') return {key: task.reason === 'return' ? 'returning' : 'arriving', label: task.reason === 'return' ? '返回座位' : '到班入座'};
            return {key: 'moving', label: isProjectWorkTask(task) ? '返回座位' : '前往活動地點'};
        }
        if (isProjectWorkTask(task)) {
            if (!POS[ch.deskId] || distance(ch.pos, POS[ch.deskId]) >= 0.5) return {key: 'returning', label: '待返回座位'};
            return {key: task.projectId == null ? 'internal' : 'working', label: task.projectId == null ? '內部作業' : '專案工作'};
        }
        if (task?.type === 'lunch') return {key: 'lunch', label: '午餐中'};
        if (breakTypes.includes(task?.type)) return {key: 'break', label: task.type === 'toilet' ? '如廁中' : '休息中'};
        if (task?.type === 'big_firedrill') return {key: 'emergency', label: '疏散演練'};
        if (['big_serverdown', 'big_powerout'].includes(task?.type)) return {key: 'maintenance', label: '設備處理'};
        if (['big_meeting', 'big_client', 'mentor', 'scold', 'meeting', 'collaborate'].includes(task?.type)) return {key: 'meeting', label: task.type === 'mentor' ? '指導中' : '會議中'};
        if (task?.type?.startsWith('big_')) return {key: 'activity', label: '團隊活動'};
        return {key: 'idle', label: '待安排'};
    }

    return {schedule, complete, canDispatchSales, status};
})();
