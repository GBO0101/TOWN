/* 畫面更新入口；計時器由 app.js 統一管理。 */
function render() {
  try {
    if (!document.getElementById('charactersLayer')) return;
    const hour = sim.gameTime % 24;
    SceneView.render(sim, hour);
    PanelView.render(sim, hour);
  } catch (err) {
    console.error('Render error:', err);
  }
}
