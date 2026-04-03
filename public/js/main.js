import { initDragonEffect } from './effects/dragon.effect.js';

const DRAGON_KEY = 'dragonEffectEnabled';
const DRAGON_EFFECT_TEMPORARILY_DISABLED = true;

function isDragonEffectEnabled() {
  if (DRAGON_EFFECT_TEMPORARILY_DISABLED) return false;
  return localStorage.getItem(DRAGON_KEY) !== 'false';
}

function syncFooterYear() {
  const footerYearText = document.getElementById('footerYearText');
  if (!footerYearText) return;
  footerYearText.textContent = `© ${new Date().getFullYear()} بضاعة بلدي. جميع الحقوق محفوظة.`;
}

window.addEventListener('load', () => {
  try {
    syncFooterYear();

    if (!isDragonEffectEnabled()) {
      console.info('[DragonEffect] temporarily disabled.');
      return;
    }

    const ok = initDragonEffect({
      targetSelector: '.app-shell',
      enabledOn: ['home', 'catalog', 'seller'],
      opacity: 0.18,
      speed: 0.32,
      scale: 0.82,
      intensity: 'low'
    });

    if (!ok) {
      console.info('[DragonEffect] not enabled on this screen or view.');
    }
  } catch (error) {
    console.error('[DragonEffect] failed to start:', error);
  }
});

window.addEventListener('beforeunload', () => {
  try {
    if (typeof window.destroyDragonEffect === 'function') {
      window.destroyDragonEffect();
    }
  } catch (_error) {}
});
