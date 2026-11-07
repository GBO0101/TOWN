// OfficeEvents owns its simulation phase.
const OfficeEvents = (() => {
    function tick(dt, hour) {
        CompanyGrowth.tick(hour);
        PassiveProducts.review(hour);
        // Supplier visit trigger (during work hours, ~25% chance per day, ~once every 4 days)
        if (sim.day > 1 && !sim.supplier && !sim.client && sim.day !== sim._lastSupplierVisitDay) {
            const lcHourWork = sim.gameTime % 24;
            // Check once per day at 09:35
            if (lcHourWork >= 9.58 && lcHourWork < 9.60 && Math.random() < 0.25) {
                sim._lastSupplierVisitDay = sim.day;
                spawnSupplier();
            }
        }

        // ==================== LIFECYCLE TRIGGERS ====================
        const lcHour = sim.gameTime % 24;
        // Reset daily flags at end of workday
        if (lcHour < 8.0) {
            sim._hiredToday = false;
            sim._firedToday = false;
        }

        if (lcHour >= 9 && lcHour < 10 && sim.finance.lastStaffReviewDay !== sim.day) {
            sim.finance.lastStaffReviewDay = sim.day;
            const workers = sim.characters.filter(ch => ch.employment !== 'departed');
            if (workers.length > 3 && sim.finance.cashStressDays >= 5 && CompanyFinance.available() < 0 &&
                (!sim.finance.lastLayoffDay || sim.day - sim.finance.lastLayoffDay >= ECONOMY.daysPerMonth)) {
                const demand = ch => sim.projects.reduce((sum, project) => sum + Math.max(0, (project.work || 100) - (project.workDone || 0)) * projectSkill(ch, project.type), 0);
                const victim = workers.filter(ch => ch.id !== 'boss').sort((a, b) => demand(a) - demand(b) || b.salary - a.salary)[0];
                if (victim) { layoffCharacter(victim.id); sim.finance.lastLayoffDay = sim.day; }
            }
        }

        if (sim.day === 30 && lcHour >= 9.0 && lcHour < 9.5) {
            const admin = sim.characters.find(c => c.id === 'admin' && c.employment !== 'departed');
            if (admin) {
                retireCharacter('admin');
            }
        }

        if (sim.day > 5 && lcHour >= 9.0 && lcHour < 9.5 && !sim._firedToday) {
            const lowMood = sim.characters.filter(c =>
                c.employment !== 'departed' && c.id !== 'boss' && c.isPresent && (c.mood.value ?? 0.5) < 0.2
            );
            if (lowMood.length >= 2 && Math.random() < 0.003) {
                const victim = lowMood.reduce((a, b) => (a.mood.value ?? 0.5) < (b.mood.value ?? 0.5) ? a : b);
                fireCharacter(victim.id);
            }
        }

        // Auto door event when first person leaves
        const justLeaving = sim.events.length > 0 && sim.events[0].type === 'walk_to_door';
        const nowHour = sim.gameTime % 24;
        if (nowHour >= 17.5 && nowHour < 17.6 && !sim._doorNotified) {
            sim._doorNotified = true;
            const leaving = sim.characters.filter(c => sim.hasLeftToday[c.id]).length;
            if (leaving > 0) {
                sim.events.unshift({
                    id: sim.eventId++,
                    day: sim.day,
                    time: '17:30',
                    timeLabel: '17:30',
                    type: 'door_open',
                    chars: [],
                    text: '🚪 大門開啟，員工開始下班。',
                });
            }
        }
        if (nowHour < 17.5) sim._doorNotified = false;

        // Overtime note
        if (hour >= 18.0 && hour < 18.1 && sim.overtimePolicy !== 'strict' && !sim._otNotified) {
            sim._otNotified = true;
            const staying = sim.characters.filter(c => c.isPresent && !sim.hasLeftToday[c.id]).length;
            if (staying > 0) {
                sim.events.unshift({
                    id: sim.eventId++,
                    day: sim.day,
                    time: '18:00',
                    timeLabel: '18:00',
                    type: 'overtime_note',
                    chars: [],
                    text: `🌙 仍有 ${staying} 位同仁留在辦公室。`,
                });
            }
        }
        if (hour < 18.0) sim._otNotified = false;

        // ==================== AFTER-WORK EVENTS ====================
        // When characters leave work for the day, give them an after-work event
        // that affects next day's starting mood/health'
        if (hour >= 17.5 && hour < 20.0) {
            for (const ch of sim.characters) {
                // Character just left (state === 'gone' but hasn't had after-work event today)'
                if (ch.employment !== 'departed' && sim.hasLeftToday[ch.id] && !ch.isPresent && ch.state === 'gone' && !ch._afterWorkDone) {
                    ch._afterWorkDone = true;

                    if (ch.id === 'boss' && sim.day !== sim._bossDrinkingDay && Math.random() < 0.28) {
                        sim._bossDrinkingDay = sim.day;

                        updateMood(ch.id, 0.05);
                        if (Math.random() < 0.5) {

                            if (sim.projects.filter(project => project.source !== 'product').length < sim.maxProjects) {
                                const proj = startNewProject(undefined, null);
                                if (!proj) continue;
                                updateMood('boss', 0.15);
                                sim.events.unshift({
                                    id: sim.eventId++,
                                    day: sim.day,
                                    time: `${Math.floor(sim.gameTime%24)}:00`,
                                    type: 'boss_drinking',
                                    chars: [{
                                        id: 'boss',
                                        name: '張志強',
                                        emoji: '👔',
                                        color: '#FF6B6B'
                                    }],
                                    text: `🤝 張老闆在應酬中談成專案「${proj.name}」，報酬 ${proj.reward.toLocaleString()}。`,
                                });
                            }
                        } else {

                            const active = sim.projects.filter(p => p.progress < 100);
                            if (active.length > 0) {
                                const target = active.reduce((a, b) => a.progress > b.progress ? a : b);
                                sim.finance.reputation = Math.min(1, sim.finance.reputation + 0.02);
                                sim.events.unshift({
                                    id: sim.eventId++,
                                    day: sim.day,
                                    time: `${Math.floor(sim.gameTime%24)}:00`,
                                    type: 'boss_drinking',
                                    chars: [{
                                        id: 'boss',
                                        name: '張志強',
                                        emoji: '👔',
                                        color: '#FF6B6B'
                                    }],
                                    text: `🤝 張老闆就專案「${target.name}」與客戶交流，合作信任提升；交付仍按實際工作量計算。`,
                                });
                            }
                        }
                    } else {
                        const evt = pick(AFTER_WORK_EVENTS);
                        ch._afterWorkEvent = evt;
                        // Apply mood effect immediately (will persist to next day)
                        updateMood(ch.id, evt.mood);
                        EmployeeHealth.lifestyle(ch, evt.health);

                        if (Math.random() < 0.3) {
                            sim.events.unshift({
                                id: sim.eventId++,
                                day: sim.day,
                                time: `${Math.floor(sim.gameTime%24)}:00`,
                                type: 'after_work',
                                chars: [{
                                    id: ch.id,
                                    name: ch.name,
                                    emoji: ch.emoji,
                                    color: ch.color
                                }],
                                text: `${ch.name}${evt.text}${evt.mood > 0 ? ' 😊' : evt.mood < 0 ? ' 😔' : ''}`,
                            });
                        }
                    }
                }
            }
        }
        // Reset after-work flag in the morning
        if (hour >= 8.0 && hour < 8.5) {
            for (const ch of sim.characters) {
                if (ch.employment !== 'departed') ch._afterWorkDone = false;
            }
        }

        // ==================== ALL-GONE FAST-FORWARD ====================
        // When everyone has left after work hours, close door and skip to next morning
        if (hour >= 17.5 && !sim._nightSkip) {
            const allGone = sim.characters.filter(c => c.employment !== 'departed').every(c => !c.isPresent);

            const salesActive = sim.characters.some(c => professionKey(c) === 'sales' && c.employment !== 'departed' && !c.isPresent && c.task);
            const noClient = !sim.client;
            const noSupplier = !sim.supplier;
            if (allGone && noClient && noSupplier && !salesActive) {
                sim._nightSkip = true;
                sim._doorWasOpen = false;
                // Close door event
                sim.events.unshift({
                    id: sim.eventId++,
                    day: sim.day,
                    time: `${Math.floor(hour)}:${Math.floor((hour-Math.floor(hour))*60).toString().padStart(2,'0')}`,
                    type: 'door_open',
                    chars: [],
                    text: '🌙 所有人已離開，大門關閉。',
                });
                // Fast-forward to next morning (just past the day wrap point)
                sim.gameTime = 20.51;
                // The day wrap code at the top of tick() will handle the rest next frame
            }
        }
        // Reset flag in the morning
        if (hour < 8.0) sim._nightSkip = false;

        // Random praise event (boss praises someone)
        if (Math.random() < 0.001 && sim.gameTime % 24 >= 9 && sim.gameTime % 24 < 17) {
            const targets = sim.characters.filter(x => x.isPresent && x.id !== 'boss');
            if (targets.length) {
                const lucky = pick(targets);
                updateMood(lucky.id, 0.15);
                addMem(lucky.id, '得到張老闆肯定', 'praise');
                sim.events.unshift({
                    id: sim.eventId++,
                    day: sim.day,
                    time: `${Math.floor(sim.gameTime%24)}:${Math.floor((sim.gameTime%24-Math.floor(sim.gameTime%24))*60).toString().padStart(2,'0')}`,
                    type: 'praise',
                    chars: [{
                        id: lucky.id,
                        name: lucky.name,
                        emoji: lucky.emoji,
                        color: lucky.color
                    }],
                    text: `⭐ 張老闆稱讚${lucky.name}：「做得很好。」`,
                });
            }
        }

        // Big event trigger
        const beHour = sim.gameTime % 24;
        if (sim.day >= 2 && beHour >= 9.5 && beHour <= 16 && sim.day !== sim._bigEventDay && sim._bigEventCooldown <= 0) {
            const eligible = BIG_EVENTS.filter(e =>
                sim.day >= (e.minDay || 1) && beHour >= (e.timeRange[0] || 0) && beHour <= (e.timeRange[1] || 24) && (!e.condition || e.condition(sim))
            );
            if (eligible.length && Math.random() < 0.002) {
                const picked = pick(eligible);
                sim._bigEventDay = sim.day;

                sim._bigEventCooldown = (picked.cdDays || 3) * 13;
                // Apply to all characters
                for (const ch of sim.characters) picked.apply(ch);
                // Track active event for bottom-right display
                let maxEnd = 0;
                for (const ch of sim.characters) {
                    if (ch.task && ch.task.type && ch.task.type.startsWith('big_') && ch.task.endGT > maxEnd) maxEnd = ch.task.endGT;
                }
                if (maxEnd > sim.gameTime) {
                    sim._activeBigEvent = {
                        id: picked.id,
                        name: picked.name,
                        emoji: picked.emoji,
                        endGT: maxEnd
                    };
                }
                // Generate timeline entry
                const hh = Math.floor(sim.gameTime % 24);
                const mm = Math.floor(((sim.gameTime % 24) - hh) * 60);
                const timeStr = `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`;
                sim.events.unshift({
                    id: sim.eventId++,
                    day: sim.day,
                    time: timeStr,
                    type: `big_${picked.id}`,
                    chars: sim.characters.filter(c => c.isPresent).map(c => ({
                        id: c.id,
                        name: c.name,
                        emoji: c.emoji,
                        color: c.color
                    })),
                    text: picked.text(),
                });
                // Apply mood effects
                for (const ch of sim.characters) {
                    if (ch.employment === 'departed') continue;
                    const eff = picked.moodEffect(ch);
                    if (eff) {
                        const delta = eff.default || 0;
                        const special = eff[ch.id];
                        updateMood(ch.id, special !== undefined ? special : delta);
                    }
                }
                // Notify user
                notify(`${picked.emoji} ${picked.name}${picked.desc}`, 4000);

                // Spawn client if client_visit event
                if (picked.id === 'client_visit') {
                    spawnClient();
                }
            }
        }
        if (sim._bigEventCooldown > 0) sim._bigEventCooldown -= dt * CFG.speed;

        // Mood decay: slowly revert toward 0.6
        for (const ch of sim.characters) {
            if (ch.employment === 'departed') continue;
            if (ch.mood.value !== undefined) {
                const diff = 0.6 - ch.mood.value;
                ch.mood.value = clamp(ch.mood.value + diff * 0.0005, 0, 1);
                ch.mood = moodFromValue(ch.mood.value);
            }
        }

        // Clear active big event when it ends
        if (sim._activeBigEvent && sim.gameTime >= sim._activeBigEvent.endGT) {
            sim._activeBigEvent = null;
        }
    }

    return { tick };
})();
