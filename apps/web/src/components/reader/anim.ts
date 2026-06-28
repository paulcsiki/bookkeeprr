'use client';

/**
 * Reader chrome keyframes. Injected once into <head> the same way the prototype
 * did (rather than living in globals.css) so the reader chrome carries its own
 * animation contract. Idempotent — guarded by the style element's id.
 */

const STYLE_ID = 'rd-chrome-anim';

const KEYFRAMES = `
@keyframes rd-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes rd-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes rd-slide-left { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes rd-slide-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes rd-page-in { from { opacity: 0; transform: translateX(var(--rd-from, 12px)); } to { opacity: 1; transform: translateX(0); } }
@keyframes rd-eq { 0%, 100% { height: 30%; } 50% { height: 100%; } }
@keyframes rd-pop {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: none; }
}
@keyframes rd-glow {
  0%, 100% { opacity: 0.3; }
  50%      { opacity: 1; }
}
@keyframes rd-spark {
  0%   { opacity: 0; transform: translateY(0) scale(0.6); }
  50%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-160px) scale(1); }
}
@keyframes rd-ring {
  from { opacity: 0.8; transform: scale(0.4); }
  to   { opacity: 0;   transform: scale(2);   }
}
@keyframes rd-rise {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: none; }
}
.rd-pop  { animation: rd-pop 0.5s cubic-bezier(.16,1,.3,1) both; }
.rd-glow { animation: rd-glow 3.4s ease-in-out infinite; }
.rd-spark { animation: rd-spark linear infinite; }
.rd-ring { animation: rd-ring 1.1s ease-out 0.25s both; }
.rd-rise { animation: rd-rise 0.6s cubic-bezier(.16,1,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .rd-pop, .rd-glow, .rd-spark, .rd-ring, .rd-rise { animation: none !important; opacity: 1 !important; }
}
`;

/** Ensure the reader keyframes are present in the document head. */
export function ensureReaderKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}
