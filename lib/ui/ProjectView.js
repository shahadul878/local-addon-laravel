'use strict';

const { styles } = require('./styles');

/**
 * One-click commands. Artisan always runs with --no-interaction here, and Laravel's migrate then
 * refuses to create a missing database unless --force is given, so the button passes it.
 */
const QUICK_COMMANDS = Object.freeze([
  Object.freeze({ label: 'migrate', command: 'migrate --force', title: 'php artisan migrate --force (creates the database if it is missing)' }),
  ...['migrate:status', 'db:seed', 'optimize:clear', 'route:list', 'about'].map((name) => Object.freeze({ label: name, command: name, title: `php artisan ${name}` })),
]);
const ENV_ROWS = Object.freeze([
  ['APP_URL', 'App URL'],
  ['APP_ENV', 'Environment'],
  ['DB_CONNECTION', 'DB driver'],
  ['DB_HOST', 'DB host'],
  ['DB_PORT', 'DB port'],
  ['DB_DATABASE', 'DB name'],
  ['MAIL_MAILER', 'Mailer'],
  ['MAIL_PORT', 'Mail port'],
]);

function formatDate(iso) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function createProjectView(React, ui) {
  const {
    h, Button, Card, Badge, Notice, Console, Checkbox, KeyValues, Code, CopyButton,
  } = ui;

  function AppCard({ state, actions }) {
    const { site, laravel } = state;
    const rows = [
      ['URL', h('span', { style: styles.row }, h(Code, null, site.url), h(CopyButton, { value: site.url }))],
      ['Folder', h(Code, null, site.appDir)],
      ['Laravel', laravel.version || `${laravel.constraint} (dependencies not installed)`],
      ['PHP', state.php.version || site.phpVersion],
      ['Web server', site.webServer || '—'],
    ];
    const installed = formatDate(laravel.installedAt);
    return h(Card, { title: 'App', accent: true },
      h(KeyValues, { rows: installed ? [...rows, ['Installed', installed]] : rows }),
      h('div', { style: { ...styles.row, marginTop: 18 } },
        h(Button, { variant: 'primary', onClick: () => actions.openUrl(site.url) }, 'Open site'),
        h(Button, { onClick: () => actions.openFolder(site.appDir) }, 'Open folder'),
        site.mail && site.mail.webPort ? h(Button, { onClick: () => actions.openUrl(`http://localhost:${site.mail.webPort}`) }, 'Mailpit inbox') : null));
  }

  function EnvCard({ state, busy, actions }) {
    const { laravel } = state;
    if (!laravel.env) {
      return h(Card, { title: 'Environment' }, h(Notice, { tone: 'warn' }, 'No .env file found in the app folder.'));
    }
    const pending = laravel.pendingSync;
    return h(Card, { title: 'Environment', aside: h(Badge, { tone: pending.length ? 'warn' : 'ok' }, pending.length ? 'Out of sync' : 'In sync') },
      pending.length
        ? h(Notice, { tone: 'warn' },
          h('div', null, "Local's settings changed since .env was written:"),
          h('ul', { style: { margin: '6px 0 10px', paddingLeft: 18 } },
            pending.map((change) => h('li', { key: change.key }, h(Code, null, change.key), ` ${change.from || '—'} → ${change.to}`))),
          h(Button, { variant: 'primary', disabled: Boolean(busy), onClick: actions.syncEnv }, 'Update .env'))
        : null,
      h(KeyValues, { rows: ENV_ROWS.map(([key, label]) => [label, h(Code, null, laravel.env[key] || '—')]) }),
      h('div', { style: { marginTop: 16 } },
        h(Checkbox, { checked: laravel.autoSync, disabled: Boolean(busy), onChange: actions.setAutoSync },
          'Update .env automatically when the site starts')),
      h('p', { style: styles.hint }, 'Only the app URL, DB port and mail port are touched, and only while they point at Local.'));
  }

  function ArtisanCard({ state, busy, output, actions }) {
    const [command, setCommand] = React.useState('');
    const isRunning = busy === 'artisan';
    const run = (value) => actions.runArtisan(value);
    return h(Card, { title: 'Artisan', aside: output.lines.length ? h(Button, { variant: 'chip', onClick: actions.clearOutput }, 'Clear') : null },
      !state.laravel.hasVendor ? h(Notice, { tone: 'fail' }, 'vendor/ is missing. Run "composer install" in the app folder first.') : null,
      !state.isDbOnline ? h(Notice, { tone: 'warn' }, `The site's database isn't running. Click "Start site" in Local before running migrate or other database commands.`) : null,
      h('div', { style: styles.row }, QUICK_COMMANDS.map((quick) => h(Button, {
        key: quick.label, variant: 'chip', title: quick.title, disabled: Boolean(busy), onClick: () => run(quick.command),
      }, quick.label))),
      h('form', {
        style: { ...styles.row, marginTop: 12, flexWrap: 'nowrap' },
        onSubmit: (event) => { event.preventDefault(); run(command); },
      },
      h('span', { style: { ...styles.code, whiteSpace: 'nowrap' } }, 'php artisan'),
      h('input', {
        style: { ...styles.input, ...styles.monoInput }, value: command, placeholder: 'make:model Post -m', disabled: Boolean(busy), onChange: (e) => setCommand(e.target.value),
      }),
      h(Button, { variant: 'primary', type: 'submit', disabled: Boolean(busy) || !command.trim() }, isRunning ? 'Running…' : 'Run')),
      h(Console, { lines: output.lines, placeholder: 'Run a command to see its output.' }));
  }

  function DangerCard({ state, busy, actions }) {
    if (!state.laravel.isManaged) {
      return h(Notice, { tone: 'info' }, 'This Laravel app was not installed by this add-on, so it can\'t be removed from here.');
    }
    return h(Card, { title: 'Remove' },
      h('div', { style: styles.spread },
        h('p', { style: { ...styles.hint, margin: 0, flex: 1, minWidth: 240 } },
          `Moves the Laravel files to app/laravel-removed-… and ${state.laravel.previousWebRoot ? `puts the previous web root (${state.laravel.previousWebRoot}) back` : 'leaves an empty web root'}. Nothing is deleted.`),
        h(Button, { variant: 'danger', disabled: Boolean(busy), onClick: actions.uninstall }, 'Remove Laravel')));
  }

  /** Shown once the site has a Laravel app. */
  function ProjectView(props) {
    return h('div', null,
      h('div', { style: styles.grid }, h(AppCard, props), h(EnvCard, props)),
      h(ArtisanCard, props),
      h(DangerCard, props));
  }

  return ProjectView;
}

module.exports = { createProjectView, QUICK_COMMANDS };
