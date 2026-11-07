'use strict';

/**
 * Inline styles. Local doesn't expose its component library to third-party add-ons, so the
 * panel is self-styled: text inherits Local's theme colour and surfaces are translucent,
 * which reads well in both Local's light and dark themes.
 */
const COLOR = Object.freeze({
  accent: '#f53003',
  accentSoft: 'rgba(245, 48, 3, 0.10)',
  accentText: '#ffffff',
  ok: '#2e9e5b',
  warn: '#c98a12',
  info: '#3d7fd6',
  fail: '#d23f31',
  muted: 'rgba(127, 127, 127, 0.9)',
  border: 'rgba(127, 127, 127, 0.26)',
  surface: 'rgba(127, 127, 127, 0.05)',
  codeSurface: 'rgba(127, 127, 127, 0.13)',
  console: '#141417',
  consoleText: '#dcdce0',
});

const STATUS_COLOR = Object.freeze({
  ok: COLOR.ok, done: COLOR.ok, warn: COLOR.warn, warning: COLOR.warn, info: COLOR.info,
  fail: COLOR.fail, failed: COLOR.fail, running: COLOR.accent, skipped: COLOR.muted, pending: COLOR.border,
});

const SPACE = Object.freeze({ xs: 4, sm: 8, md: 14, lg: 22, xl: 32 });
const RADIUS = 8;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const styles = Object.freeze({
  panel: { padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.xl}px`, overflowY: 'auto', height: '100%', boxSizing: 'border-box', maxWidth: 980 },
  header: { display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.lg },
  mark: {
    width: 40, height: 40, borderRadius: 10, background: COLOR.accent, color: COLOR.accentText, display: 'grid', placeItems: 'center',
    fontWeight: 800, fontSize: 20, boxShadow: '0 6px 18px rgba(245, 48, 3, 0.28)', flexShrink: 0,
  },
  title: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.015em' },
  subtitle: { color: COLOR.muted, fontSize: 13, margin: `${SPACE.xs}px 0 0` },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: SPACE.lg, alignItems: 'start' },
  card: { border: `1px solid ${COLOR.border}`, borderRadius: RADIUS, background: COLOR.surface, padding: SPACE.lg, marginBottom: SPACE.lg },
  cardAccent: { borderTop: `3px solid ${COLOR.accent}` },
  cardTitle: {
    fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: COLOR.muted, margin: `0 0 ${SPACE.md}px`,
  },
  row: { display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' },
  spread: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md, flexWrap: 'wrap' },
  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.md },
  checkList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: SPACE.sm + 2 },
  checkItem: { display: 'grid', gridTemplateColumns: '18px 1fr', gap: SPACE.sm, alignItems: 'start' },
  checkLabel: { fontSize: 13, fontWeight: 600 },
  checkDetail: { fontSize: 12.5, color: COLOR.muted, marginTop: 2, lineHeight: 1.45 },
  kvGrid: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: `${SPACE.sm}px ${SPACE.md}px`, alignItems: 'center', fontSize: 13 },
  kvLabel: { color: COLOR.muted },
  code: { fontFamily: MONO, fontSize: 12.5, background: COLOR.codeSurface, padding: '2px 7px', borderRadius: 4, wordBreak: 'break-all' },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: COLOR.muted, marginBottom: 6 },
  input: {
    font: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: `1px solid ${COLOR.border}`,
    background: 'transparent', color: 'inherit', width: '100%', boxSizing: 'border-box',
  },
  monoInput: { fontFamily: MONO },
  hint: { color: COLOR.muted, fontSize: 12.5, margin: `${SPACE.sm}px 0 0`, lineHeight: 1.45 },
  checkbox: { display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: 13, cursor: 'pointer' },
  console: {
    fontFamily: MONO, fontSize: 12, lineHeight: 1.5, background: COLOR.console, color: COLOR.consoleText, padding: SPACE.md,
    borderRadius: RADIUS, height: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
    paddingRight: 112, boxSizing: 'border-box',
  },
  consoleWrap: { position: 'relative', marginTop: SPACE.md },
  consoleActions: { position: 'absolute', top: SPACE.sm, right: SPACE.lg },
  error: {
    border: `1px solid ${COLOR.fail}`, color: COLOR.fail, background: 'rgba(210, 63, 49, 0.06)', borderRadius: RADIUS,
    padding: SPACE.md, marginBottom: SPACE.lg, fontSize: 13, whiteSpace: 'pre-wrap',
  },
});

function buttonStyle(variant, isDisabled) {
  const base = {
    font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 15px', borderRadius: 6,
    cursor: isDisabled ? 'default' : 'pointer', opacity: isDisabled ? 0.45 : 1, transition: 'opacity 150ms ease, transform 150ms ease',
  };
  if (variant === 'primary') {
    return { ...base, background: COLOR.accent, color: COLOR.accentText, border: `1px solid ${COLOR.accent}` };
  }
  if (variant === 'danger') {
    return { ...base, background: 'transparent', color: COLOR.fail, border: `1px solid ${COLOR.fail}` };
  }
  if (variant === 'chip') {
    return { ...base, fontFamily: MONO, fontWeight: 500, fontSize: 12, padding: '5px 10px', background: COLOR.codeSurface, color: 'inherit', border: '1px solid transparent' };
  }
  if (variant === 'console') {
    // Sits on the always-dark console, so it uses fixed light-on-dark colours in both themes.
    return {
      ...base, fontSize: 12, padding: '5px 10px', background: 'rgba(255, 255, 255, 0.10)', color: COLOR.consoleText,
      border: '1px solid rgba(255, 255, 255, 0.18)', backdropFilter: 'blur(4px)',
    };
  }
  return { ...base, background: 'transparent', color: 'inherit', border: `1px solid ${COLOR.border}` };
}

function segmentStyle(isActive, isDisabled) {
  return {
    font: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', cursor: isDisabled ? 'default' : 'pointer', flex: 1,
    border: 'none', borderRadius: 5, opacity: isDisabled ? 0.45 : 1,
    background: isActive ? COLOR.accent : 'transparent', color: isActive ? COLOR.accentText : 'inherit',
  };
}

const segmentTrack = { display: 'flex', gap: 3, padding: 3, borderRadius: 8, border: `1px solid ${COLOR.border}` };

function dotStyle(status) {
  const color = STATUS_COLOR[status] || COLOR.muted;
  return {
    width: 10, height: 10, borderRadius: '50%', marginTop: 4, background: status === 'pending' ? 'transparent' : color,
    border: `2px solid ${color}`, boxSizing: 'border-box', boxShadow: status === 'running' ? `0 0 0 4px ${COLOR.accentSoft}` : 'none',
  };
}

function badgeStyle(tone) {
  const color = STATUS_COLOR[tone] || COLOR.muted;
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '3px 10px',
    borderRadius: 999, border: `1px solid ${color}`, color,
  };
}

function noticeStyle(tone) {
  const color = STATUS_COLOR[tone] || COLOR.info;
  return {
    borderLeft: `3px solid ${color}`, background: COLOR.surface, padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
    borderRadius: 4, fontSize: 13, lineHeight: 1.5, marginBottom: SPACE.md,
  };
}

module.exports = {
  styles, buttonStyle, segmentStyle, segmentTrack, dotStyle, badgeStyle, noticeStyle, COLOR, SPACE,
};
