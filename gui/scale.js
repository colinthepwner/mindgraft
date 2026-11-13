function setGuiScale() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.floor(Math.min(innerWidth * dpr / 320, innerHeight * dpr / 240)));
  document.documentElement.style.setProperty('--u', (scale / dpr) + 'px');
  window.guiUnit = scale / dpr;
  window.dispatchEvent(new Event('guiscale'));
}
setGuiScale();
addEventListener('resize', setGuiScale);
