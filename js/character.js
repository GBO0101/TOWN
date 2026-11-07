// 人物共用動作；排程與狀態由 CharacterRules 統一處理。
function generateThought(ch) {
    if (!ch.isPresent || ch.employment === 'departed') return null;
    const status = CharacterRules.status(ch);
    if (status.key === 'lunch' || status.key === 'break') return {type: 'need_rest', text: '休息後再繼續工作'};
    const topics = {
        tech: ['確認實作與測試', '把目前工作完成'], designer: ['確認設計細節', '整理使用者流程'],
        admin: ['確認文件與安排', '把資料整理清楚'], marketing: ['確認成效與企劃', '整理行銷資料'],
        sales: ['安排客戶接洽', '確認提案與回覆'], boss: ['確認工作量與人力', '檢查公司營運狀況'],
    };
    return {type: 'work_focus', text: pick(topics[professionKey(ch)] || topics.tech)};
}

function setSpeech(ch, text) { ch.speech = {text, timer: 9}; }

function assignDeskTask(ch, task, text, duration) {
    contributeToProject(ch.id, ch.task);
    const deskPos = POS[ch.deskId];
    const atDesk = distance(ch.pos, deskPos) < 0.5;
    ch.targetPos = {...deskPos};
    ch.state = atDesk ? 'sitting' : 'walking';
    ch.currentAction = atDesk ? text : '返回自己的座位';
    ch.task = {...task, actionText: text};
    if (isProjectWorkTask(task)) {
        const project = selectWorkProject(ch);
        ch.task.projectId = project ? project.id : null;
        ch.task.contractId = project?.contractId;
    }
    if (atDesk) {
        ch.pos = {...deskPos};
        ch.task.startedGT = sim.gameTime;
        ch.task.startedDay = sim.day;
        ch.task.endGT = sim.gameTime + duration;
    } else ch.task._duration = duration;
}

function pickRoleAction(ch, maxDuration = Infinity) {
    const available = ROLE_ACTIONS[ch.id] || ROLE_ACTIONS[professionKey(ch)] || [];
    const actions = professionKey(ch) === 'sales' ? available.filter(action => !action.wander) : available;
    if (!actions.length || maxDuration <= 0) return null;
    const action = pick(actions);
    const duration = Math.min(maxDuration, action.duration[0] + Math.random() * (action.duration[1] - action.duration[0]));
    assignDeskTask(ch, {type: action.type, roleAction: action}, pick(action.texts), duration);
    return ch.task;
}

function scheduleNext(ch) { CharacterRules.schedule(ch); }
