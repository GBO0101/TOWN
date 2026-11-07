// CharacterSimulation owns its simulation phase.
const CharacterSimulation = (() => {
    function finishTask(ch, task) {
        if (task.type === 'walk_to_door') {
            ch.isPresent = false;
            ch.pos = { x: 50, y: 95 };
            ch.state = 'gone';
            ch.currentAction = '已下班';
            sim.hasLeftToday[ch.id] = true;
            punchOut(ch.id);
            generateEvent(ch, task.type);
            return;
        }
        if (task.type === 'client_visit' && professionKey(ch) === 'sales') {
            const attempt = sim._projectAttempt;
            if (attempt && (!attempt.salesId || attempt.salesId === ch.id) && attempt.proj.id === task._projectAttemptId) {
                attempt.visitsDone++;
                if (attempt.visitsDone >= attempt.visitsNeeded) {
                    const won = Math.random() < attempt.successRate;
                    const accepted = attempt.kind === 'product' ? PassiveProducts.acquireCustomers(attempt.proj, ch, won) : won && startNewProject(attempt.proj, ch.id);
                    if (attempt.kind !== 'product') officeEvent('note', ch.name + (accepted ? '成功取得「' : won ? '因產能或利潤變動暫緩簽約「' : '未能取得「') + attempt.proj.name + '」。', [ch]);
                    updateMood(ch.id, accepted ? 0.15 : -0.12);
                    updateMood('boss', accepted ? 0.1 : -0.08);
                    sim._projectAttempt = null;
                } else {
                    officeEvent('note', ch.name + '完成第 ' + attempt.visitsDone + ' 次拜訪，準備回公司安排後續。', [ch]);
                }
            }
        } else if (task.type === 'pursue_deal' && ch.id === 'boss') {
            const won = Math.random() < (0.6 + sim.characters.filter(c => c.isPresent).length * 0.02);
            if (won && sim.projects.filter(project => project.source !== 'product').length < sim.maxProjects) {
                const project = pickProject(null);
                if (project) {
                    const scale = 1.25 + Math.random() * 0.5;
                    project.reward = Math.round(project.reward * scale);
                    project.work = Math.ceil(project.work * scale);
                    project.marketBudget = Math.round(project.marketBudget * scale);
                    if (startNewProject(project, null)) officeEvent('note', '老闆取得大案「' + project.name + '」，工作量與合約金額一併增加', [ch]);
                }
            }
            updateMood('boss', won ? 0.15 : -0.08);
        } else if (task.type === 'day1_prospecting') {
            if (sim.projects.length < sim.maxProjects && Math.random() < 0.4 + sim.finance.reputation * 0.5) startNewProject(undefined, ch.id);
            updateMood(ch.id, 0.15);
        } else if (task.roleAction) {
            contributeToProject(ch.id, task);
            if (task.roleAction.moodOnDone) updateMood(ch.id, task.roleAction.moodOnDone);
        } else if (task.type === 'work' || task.type === 'overtime') {
            contributeToProject(ch.id, task);
        }
        if (task.type === 'mentor' && task.withId) {
            const other = sim.characters.find(c => c.id === task.withId && c.employment !== 'departed');
            if (other && !other.isPresent) {
                other.isPresent = true;
                other.pos = { ...DOOR_POS };
                other.task = null;
                scheduleNext(other);
            }
        }
        if (!task.type.startsWith('big_') && task.type !== 'walk_to_desk') generateEvent(ch, task.type, task);
        CharacterRules.complete(ch, task);
        if (ch.id === 'boss' && sim.day > 1 && sim.day !== sim._lastBossInvestDay && Math.random() < 0.008) {
            bossInvest();
        }
        scheduleNext(ch);
    }

    function tick(dt) {
        for (const ch of sim.characters) {
            if (ch.employment === 'departed') continue;
            if (EmployeeHealth.onLeave(ch)) { scheduleNext(ch); continue; }
            contributeToProject(ch.id, ch.task);
            if (isProjectWorkTask(ch.task) &&
                ((ch.task.projectId === null && sim.projects.length) ||
                 (ch.task.projectId != null && !sim.projects.some(project => project.id === ch.task.projectId &&
                   (ch.task.contractId == null || ch.task.contractId === project.contractId))))) ch.task = null;
            if (ch.speech) {
                ch.speech.timer -= dt;
                if (ch.speech.timer <= 0) ch.speech = null;
            }
            if (professionKey(ch) === 'sales' && !ch.isPresent && sim._projectAttempt &&
                (!sim._projectAttempt.salesId || sim._projectAttempt.salesId === ch.id) &&
                !(ch.task?.type === 'client_visit' && ch.task._projectAttemptId === sim._projectAttempt.proj.id)) {
                scheduleNext(ch);
            }
            if (!ch.task) scheduleNext(ch);
            if (ch.isPresent && ch.state === 'walking' && ch.targetPos) {
                const dx = ch.targetPos.x - ch.pos.x;
                const dy = ch.targetPos.y - ch.pos.y;
                const dist = Math.hypot(dx, dy);
                const step = Math.max(0, (ch.traits?.speed || 1) * 45 * dt * Math.max(1, CFG.speed / 0.04));
                if (dist <= Math.max(0.5, step)) {
                    ch.pos = { ...ch.targetPos };
                    ch.state = ch.task?.arrivalState || 'sitting';
                    if (ch.task?.actionText) ch.currentAction = ch.task.actionText;
                    if (ch.task?.isOutside) {
                        ch.isPresent = false;
                        ch.pos = { x: 50, y: 95 };
                        ch.state = 'gone';
                    }
                    if (ch.task?._duration) {
                        ch.task.startedGT = sim.gameTime;
                        ch.task.startedDay = sim.day;
                        ch.task.endGT = Math.min(sim.gameTime + ch.task._duration, ch.task.returnByGT ?? Infinity);
                        delete ch.task._duration;
                    }
                } else {
                    ch.pos.x += dx / dist * step;
                    ch.pos.y += dy / dist * step;
                }
            }
            if (ch.task && ch.state !== 'walking') {
                if (ch.task.maxProgress > 0) {
                    ch.task.progress = (ch.task.progress || 0) + dt * CFG.speed;
                    if (ch.task.progress >= ch.task.maxProgress) ch.task.endGT = sim.gameTime;
                }
                if (sim.gameTime >= ch.task.endGT) {
                    const task = ch.task;
                    ch.task = null;
                    finishTask(ch, task);
                }
            }
        }
    }

    return { tick };
})();
