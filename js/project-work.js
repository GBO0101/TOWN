/* 專案職能、人力分配、有效工時與進度摘要。 */
function projectSkill(ch, type) {
    const rates = CONTRIB_RATE[ch.id];
    if (rates) return (rates[type] || 0.3) / 3;
    if (ch.field) return ch.field === type ? ch.skill || 1 : 0.1;
    const roles = {tech: '工程師', design: '設計師', mkt: '行銷', admin: '行政'};
    return sameField(ch.role || '', roles[type] || '') ? 1 : 0.1;
}

function projectDeadlineDays(project) {
    const booked = sim.projects.filter(item => item !== project && item.source !== 'product' && item.type === project.type)
        .reduce((sum, item) => sum + Math.max(0, item.work - (item.workDone || 0)), 0);
    return Math.max(5, Math.ceil((booked + (project.work || 100)) / Math.max(0.5, projectDailyCapacity(project.type)) * ECONOMY.deadlineBuffer));
}

function selectWorkProject(ch) {
    const peers = project => projectWorkers(project).filter(worker => worker.id !== ch.id);
    const finishing = project => !peers(project).length &&
        (project.work || 100) - (project.workDone || 0) <= projectSkill(ch, project.type) * EmployeeHealth.efficiency(ch) * 0.5;
    const waiting = project => {
        const age = sim.day * 24 + sim.gameTime - (project.lastWorkedAt ?? project.startDay * 24 + project.startTime);
        return age >= 2 ? age : 0;
    };
    const pressure = project => {
        const assigned = peers(project).reduce((sum, worker) => sum + projectSkill(worker, project.type) * EmployeeHealth.efficiency(worker), 0);
        const remaining = Math.max(0, (project.work || 100) - (project.workDone ?? (project.progress || 0) * (project.work || 100) / 100));
        return remaining / (assigned + projectSkill(ch, project.type) * EmployeeHealth.efficiency(ch)) / Math.max(1, (project.deadlineDay || sim.day + 1) - sim.day);
    };
    return [...sim.projects].filter(project => (project.progress < 100 || project.progress == null) &&
        (project.source !== 'product' || sim.gameTime < 17.5 && PassiveProducts.canWork(project)))
        .sort((a, b) => projectSkill(ch, b.type) - projectSkill(ch, a.type) ||
            Number(!!b.maintenance) - Number(!!a.maintenance) ||
            Number(!peers(b).length) - Number(!peers(a).length) || Number(finishing(b)) - Number(finishing(a)) ||
            waiting(b) - waiting(a) || pressure(b) - pressure(a) || a.deadlineDay - b.deadlineDay)[0];
}

function isProjectWorkTask(task) {
    return !!task && !task.isOutside && (task.type === 'work' || task.type === 'overtime' || !!task.roleAction);
}

function projectWorkers(project) {
    return sim.characters.filter(ch => ch.employment !== 'departed' && !EmployeeHealth.onLeave(ch) && ch.isPresent && isProjectWorkTask(ch.task) &&
        ch.task.projectId === project.id && (ch.task.contractId == null || ch.task.contractId === project.contractId));
}

function finishProjectWork(project) {
    for (const ch of sim.characters) {
        if (isProjectWorkTask(ch.task) && ch.task.projectId === project.id &&
            (ch.task.contractId == null || ch.task.contractId === project.contractId)) ch.task = null;
    }
    sim.lastProjectResult = {...project, contributions: {...project.contributions}, closedDay: sim.day};
}

function contributeToProject(charId, task) {
    const ch = sim.characters.find(ch => ch.id === charId && ch.employment !== 'departed');
    if (ch) CharacterCareer.record(ch, task);
    if (!ch?.isPresent || EmployeeHealth.onLeave(ch) || !isProjectWorkTask(task) || ch.state === 'walking' ||
        !POS[ch.deskId] || distance(ch.pos, POS[ch.deskId]) >= 0.5 ||
        !Number.isFinite(task.startedGT) || (task.startedDay != null && task.startedDay !== sim.day)) return;
    const project = task?.projectId ? sim.projects.find(project => project.id === task.projectId) : selectWorkProject(ch);
    if (!project || task.projectId === null || project.progress >= 100 || (!project.maintenance && project.deadlineDay < sim.day) ||
        (task.contractId != null && task.contractId !== project.contractId)) return;
    const deadlineTime = !project.maintenance && project.deadlineDay === sim.day ? 17.5 : 20.5;
    const end = Math.min(sim.gameTime, task.endGT ?? sim.gameTime, deadlineTime, 20.5);
    let start = Math.max(task.startedGT, task.accountedGT ?? task.startedGT);
    if (project.startDay === sim.day) start = Math.max(start, project.startTime);
    if (end <= start) return;
    task.accountedGT = end;
    const duration = Math.max(0, end - start);
    const lunch = Math.max(0, Math.min(end, CFG.lunchEnd) - Math.max(start, CFG.lunchStart));
    const effectiveHours = Math.max(0, duration - lunch * (1 - CFG.lunchEfficiency));
    const training = Math.min(0.15, sim.finance.programs.filter(program => program.untilDay > sim.day).reduce((sum, program) => sum + program.productivityBonus, 0));
    const work = project.work || 100;
    const done = project.workDone ?? (project.progress || 0) * work / 100;
    const amount = Math.min(work - done, effectiveHours * projectSkill(ch, project.type) * EmployeeHealth.efficiency(ch) * (0.6 + (ch.mood.value ?? 0.5) * 0.8) * (1 + training));
    if (amount <= 0) return;
    project.workDone = done + amount;
    project.lastWorkedAt = sim.day * 24 + sim.gameTime;
    if (project.workDay !== sim.day) { project.workDay = sim.day; project.workToday = 0; }
    project.workToday += amount;
    project.contributions[charId] = (project.contributions[charId] || 0) + amount;
    project.progress = Math.min(100, project.workDone / work * 100);
    if (project.progress >= 100) completeProject(project);
}

function updateProjectWork() {
    for (const ch of sim.characters) contributeToProject(ch.id, ch.task);
}

function projectWorkSnapshot(project) {
    const work = project.work || 100;
    const done = Math.max(0, Math.min(work, project.workDone ?? (project.progress || 0) * work / 100));
    const assigned = projectWorkers(project);
    const working = assigned.filter(ch => ch.state !== 'walking' && POS[ch.deskId] && distance(ch.pos, POS[ch.deskId]) < 0.5 &&
        Number.isFinite(ch.task.startedGT) && ch.task.startedGT <= sim.gameTime && ch.task.endGT > sim.gameTime &&
        (ch.task.startedDay == null || ch.task.startedDay === sim.day));
    return {work, done, remaining: work - done, progress: done / work * 100, assigned, working};
}


