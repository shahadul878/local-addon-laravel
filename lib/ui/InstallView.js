'use strict';

const { INSTALL_STEPS, DEFAULT_DB_NAME, DEFAULT_LARAVEL_MAJOR } = require('../constants');
const { buildChecks, hasBlockingCheck } = require('../preflight');
const { isAtLeast } = require('../versions');
const { styles } = require('./styles');

/** Newest release this site's PHP can run, falling back to the default. */
function pickDefaultMajor(state) {
  const compatible = state.releases.find((release) => state.php.isFound && isAtLeast(state.php.version, release.minPhp));
  return compatible ? compatible.major : DEFAULT_LARAVEL_MAJOR;
}

function initialForm(state) {
  const dbDriver = state.site.db ? 'mysql' : 'sqlite';
  return {
    laravelMajor: pickDefaultMajor(state),
    appName: state.site.name,
    dbDriver,
    dbName: DEFAULT_DB_NAME,
    shouldMigrate: dbDriver === 'sqlite' || state.isDbOnline,
  };
}

function createInstallView(React, ui) {
  const {
    h, Button, Card, CheckRow, Segmented, Field, Checkbox, Console, Notice,
  } = ui;

  function ProgressCard({ output, isBusy, onReset }) {
    const failed = INSTALL_STEPS.some((step) => (output.steps[step.id] || {}).status === 'failed');
    const aside = isBusy ? null : h(Button, { variant: 'chip', onClick: onReset }, 'Back to form');
    return h(Card, { title: isBusy ? 'Installing Laravel…' : 'Install log', accent: true, aside },
      failed ? h(Notice, { tone: 'fail' }, 'The install stopped and your previous web root was left in place. Fix the problem shown in the log, then try again.') : null,
      h('ul', { style: styles.checkList }, INSTALL_STEPS.map((step) => {
        const progress = output.steps[step.id] || { status: 'pending' };
        return h(CheckRow, { key: step.id, status: progress.status, label: step.label, detail: progress.detail });
      })),
      h(Console, { lines: output.lines, placeholder: 'Waiting for Composer…' }));
  }

  function InstallForm({ state, form, setForm, checks, isBusy, onInstall }) {
    const set = (key) => (value) => setForm({ ...form, [key]: value });
    const release = state.releases.find((r) => r.major === form.laravelMajor);
    const isBlocked = hasBlockingCheck(checks);
    return h(Card, { title: 'New Laravel app', accent: true },
      h('form', {
        style: styles.stack,
        onSubmit: (event) => { event.preventDefault(); onInstall(form); },
      },
      h(Field, { label: 'Version', hint: `Needs PHP ${release.minPhp.replace(/\.0$/, '')} or newer.` },
        h(Segmented, {
          value: form.laravelMajor,
          disabled: isBusy,
          onChange: set('laravelMajor'),
          options: state.releases.map((r) => ({ value: r.major, label: r.label })),
        })),
      h(Field, { label: 'App name' },
        h('input', { style: styles.input, value: form.appName, maxLength: 60, disabled: isBusy, onChange: (e) => set('appName')(e.target.value) })),
      h(Field, { label: 'Database' },
        h(Segmented, {
          value: form.dbDriver,
          disabled: isBusy,
          onChange: (dbDriver) => setForm({ ...form, dbDriver, shouldMigrate: dbDriver === 'sqlite' || state.isDbOnline }),
          options: [
            { value: 'mysql', label: state.site.db && state.site.db.engine === 'mariadb' ? "Site's MariaDB" : "Site's MySQL", disabled: !state.site.db },
            { value: 'sqlite', label: 'SQLite file' },
          ],
        })),
      form.dbDriver === 'mysql' ? h(Field, { label: 'Database name', hint: 'Created on first migration. Kept apart from the WordPress "local" database.' },
        h('input', {
          style: { ...styles.input, ...styles.monoInput }, value: form.dbName, maxLength: 64, disabled: isBusy, onChange: (e) => set('dbName')(e.target.value),
        })) : null,
      h(Checkbox, { checked: form.shouldMigrate, disabled: isBusy, onChange: set('shouldMigrate') }, 'Run migrations after install'),
      h('div', { style: styles.spread },
        h('span', { style: styles.hint }, isBlocked ? 'Resolve the red items first.' : `Installs into ${state.site.appDir}`),
        h(Button, { variant: 'primary', type: 'submit', disabled: isBusy || isBlocked }, isBusy ? 'Installing…' : `Install ${release.label}`))));
  }

  /** Shown while the site has no Laravel app: requirements checklist + install form, then live progress. */
  function InstallView({ state, busy, output, actions }) {
    const [form, setForm] = React.useState(() => initialForm(state));
    const release = state.releases.find((r) => r.major === form.laravelMajor);
    const checks = buildChecks({
      ...state, release, laravel: state.laravel, dbDriver: form.dbDriver, shouldMigrate: form.shouldMigrate,
    });
    const isBusy = busy === 'install';
    const hasProgress = Object.keys(output.steps).length > 0;

    return h('div', { style: styles.grid },
      h(Card, { title: 'Requirements' },
        h('ul', { style: styles.checkList }, checks.map((item) => h(CheckRow, { key: item.id, ...item })))),
      hasProgress
        ? h(ProgressCard, { output, isBusy, onReset: actions.clearOutput })
        : h(InstallForm, {
          state, form, setForm, checks, isBusy: Boolean(busy), onInstall: actions.install,
        }));
  }

  return InstallView;
}

module.exports = { createInstallView, initialForm, pickDefaultMajor };
