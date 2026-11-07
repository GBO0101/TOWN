// Advance the simulation in a fixed phase order.
function tick(dt) {
    if (sim.paused) return;
    sim.gameTime += dt * CFG.speed;
    updateProjectWork();
    if (sim.gameTime >= 20.5) {
        SimulationDay.startNextDay();
        return;
    }
    if (sim.day !== sim._lastPunchResetDay) {
        sim._lastPunchResetDay = sim.day;
        resetDailyPunch();
    }
    const hour = sim.gameTime % 24;
    ProjectPipeline.tick(hour);
    SimulationDay.settleFinances(hour);
    CharacterSimulation.tick(dt);
    tickClient(dt);
    tickSupplier(dt);
    OfficeEvents.tick(dt, hour);
}
