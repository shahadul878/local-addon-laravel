'use strict';

const {
  styles, buttonStyle, segmentStyle, segmentTrack, dotStyle, badgeStyle, noticeStyle,
} = require('./styles');

const COPIED_RESET_MS = 1500;

/** Small presentational building blocks, built from Local's own React instance. */
function createComponents(React, clipboard) {
  const h = React.createElement;

  function Button({ variant = 'default', disabled = false, onClick, children, title, type = 'button' }) {
    return h('button', { type, style: buttonStyle(variant, disabled), disabled, onClick, title }, children);
  }

  function Card({ title, accent = false, children, aside = null }) {
    return h('section', { style: { ...styles.card, ...(accent ? styles.cardAccent : {}) } },
      title ? h('div', { style: styles.spread }, h('h3', { style: styles.cardTitle }, title), aside) : null,
      children);
  }

  function Badge({ tone, children }) {
    return h('span', { style: badgeStyle(tone) }, children);
  }

  function Notice({ tone = 'info', children }) {
    return h('div', { style: noticeStyle(tone), role: tone === 'fail' ? 'alert' : 'note' }, children);
  }

  /** A checklist row: coloured status dot, label and detail. */
  function CheckRow({ status, label, detail }) {
    return h('li', { style: styles.checkItem },
      h('span', { style: dotStyle(status), 'aria-label': status }),
      h('div', null, h('div', { style: styles.checkLabel }, label), detail ? h('div', { style: styles.checkDetail }, detail) : null));
  }

  function Segmented({ options, value, onChange, disabled }) {
    return h('div', { style: segmentTrack, role: 'radiogroup' }, options.map((option) => h('button', {
      key: option.value,
      type: 'button',
      role: 'radio',
      'aria-checked': option.value === value,
      disabled: disabled || option.disabled,
      title: option.title,
      style: segmentStyle(option.value === value, disabled || option.disabled),
      onClick: () => onChange(option.value),
    }, option.label)));
  }

  function Field({ label, hint, children }) {
    return h('label', { style: { display: 'block' } }, h('span', { style: styles.fieldLabel }, label), children,
      hint ? h('p', { style: styles.hint }, hint) : null);
  }

  function Checkbox({ checked, onChange, disabled, children }) {
    return h('label', { style: { ...styles.checkbox, opacity: disabled ? 0.5 : 1 } },
      h('input', { type: 'checkbox', checked, disabled, onChange: (event) => onChange(event.target.checked) }), children);
  }

  function CopyButton({ value, variant = 'chip', label = 'Copy', title = 'Copy to clipboard' }) {
    const [isCopied, setIsCopied] = React.useState(false);
    React.useEffect(() => {
      if (!isCopied) {
        return undefined;
      }
      const timer = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
      return () => clearTimeout(timer);
    }, [isCopied]);
    return h(Button, { variant, title, onClick: () => { clipboard.writeText(String(value)); setIsCopied(true); } },
      isCopied ? 'Copied ✓' : label);
  }

  /** Live process output that sticks to the bottom while new lines arrive, with a copy button. */
  function Console({ lines, placeholder = 'Output appears here.' }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    }, [lines]);
    return h('div', { style: styles.consoleWrap },
      h('pre', { ref, style: styles.console, 'aria-live': 'polite' }, lines.length ? lines.join('\n') : placeholder),
      lines.length ? h('div', { style: styles.consoleActions },
        h(CopyButton, { value: lines.join('\n'), variant: 'console', label: 'Copy output', title: 'Copy the terminal output' })) : null);
  }

  function ErrorBanner({ message, onDismiss }) {
    if (!message) {
      return null;
    }
    return h('div', { style: styles.error, role: 'alert' },
      h('div', { style: styles.spread }, h('span', { style: { flex: 1 } }, message), h(Button, { onClick: onDismiss }, 'Dismiss')));
  }

  function KeyValues({ rows }) {
    return h('div', { style: styles.kvGrid }, rows.flatMap(([label, value]) => [
      h('span', { key: `${label}-label`, style: styles.kvLabel }, label),
      h('span', { key: `${label}-value` }, value),
    ]));
  }

  const Code = ({ children }) => h('code', { style: styles.code }, children);

  return {
    h, Button, Card, Badge, Notice, CheckRow, Segmented, Field, Checkbox, Console, CopyButton, ErrorBanner, KeyValues, Code,
  };
}

module.exports = { createComponents };
