/* 畫面更新入口；計時器由 app.js 統一管理。 */
function setViewText(element, value) {
  const text = String(value ?? '');
  if (element.textContent !== text) element.textContent = text;
}

function render(refreshPanels = true) {
  try {
    if (!document.getElementById('charactersLayer')) return;
    const hour = sim.gameTime % 24;
    SceneView.render(sim, hour);
    if (refreshPanels) PanelView.render(sim, hour);
  } catch (err) {
    console.error('Render error:', err);
  }
}
