'use strict';

const { styles } = require('./styles');
const { createComponents } = require('./components');
const { createInstallView } = require('./InstallView');
const { createProjectView } = require('./ProjectView');
const { reduceOutput, EMPTY_OUTPUT } = require('./api');

const POLL_INTERVAL_MS = 8000;
const SAFE_URL = /^https?:\/\//i;

/**
 * Container component: owns state, talks to the main process through `api`,
 * and hands plain props + actions to the two presentational views.
 */
function createLaravelPanel(React, { api, clipboard, confirm, shell }) {
  const ui = createComponents(React, clipboard);
  const InstallView = createInstallView(React, ui);
  const ProjectView = createProjectView(React, ui);
  const { h, Badge, ErrorBanner, Notice } = ui;

  function useSiteState(siteId) {
    const [state, setState] = React.useState(null);
    const [error, setError] = React.useState(null);
    const isMounted = React.useRef(true);
    const latestRequest = React.useRef(0);

    // Polls and post-action refreshes can overlap; only the newest response is applied.
    const refresh = React.useCallback(async () => {
      latestRequest.current += 1;
      const requestId = latestRequest.current;
      try {
        const next = await api.getState(siteId);
        if (isMounted.current && requestId === latestRequest.current) {
          setState(next);
        }
      } catch (refreshError) {
        if (isMounted.current && requestId === latestRequest.current) {
          setError(refreshError.message);
        }
      }
    }, [siteId]);

    React.useEffect(() => {
      isMounted.current = true;
      refresh();
      const timer = setInterval(refresh, POLL_INTERVAL_MS);
      return () => {
        isMounted.current = false;
        clearInterval(timer);
      };
    }, [refresh]);

    return { state, error, setError, refresh, isMounted };
  }

  function useOutput(siteId) {
    const [output, dispatch] = React.useReducer(
      (current, event) => (event.type === 'reset' ? EMPTY_OUTPUT : reduceOutput(current, event)),
      EMPTY_OUTPUT,
    );
    React.useEffect(() => api.onOutput(siteId, dispatch), [siteId]);
    return { output, dispatch };
  }

  function buildActions({ site, state, run, dispatch, setNotice }) {
    const siteId = site.id;
    return {
      install: async (form) => {
        const { webRoot } = state;
        if (!webRoot.isPublicEmpty && !confirm(`Install Laravel into "${site.name}"?\n\nThe current app/public folder${webRoot.hasWordPress ? ' (WordPress)' : ''} will be renamed to app/public.backup-… so Laravel can serve the site. Nothing is deleted.`)) {
          return;
        }
        dispatch({ type: 'reset' });
        const result = await run('install', () => api.install(siteId, form));
        if (result) {
          dispatch({ type: 'reset' });
          setNotice(result.warnings.length
            ? { tone: 'warn', text: `Laravel is installed, with problems: ${result.warnings.join(' ')}` }
            : { tone: 'ok', text: `Laravel is installed. Open ${state.site.url} to see it.` });
        }
      },
      syncEnv: async () => {
        const result = await run('sync', () => api.syncEnv(siteId));
        if (result) {
          setNotice({ tone: 'ok', text: result.changes.length ? `Updated ${result.changes.map((c) => c.key).join(', ')} in .env.` : '.env was already in sync.' });
        }
      },
      setAutoSync: (autoSync) => run('autosync', () => api.setAutoSync(siteId, autoSync)),
      runArtisan: async (command) => {
        const result = await run('artisan', () => api.runArtisan(siteId, command));
        if (result) {
          dispatch({ type: 'line', line: result.exitCode === 0 ? '✔ done' : `✖ exited with code ${result.exitCode}` });
          dispatch({ type: 'line', line: '' });
        }
      },
      uninstall: async () => {
        if (!confirm(`Remove Laravel from "${site.name}"?\n\nIts files move to app/laravel-removed-… and the previous web root comes back. The database is left untouched.`)) {
          return;
        }
        const result = await run('uninstall', () => api.uninstall(siteId));
        if (result) {
          setNotice({ tone: 'ok', text: `Laravel was moved to app/${result.removedDir}.` });
        }
      },
      openUrl: (url) => (SAFE_URL.test(url) ? shell.openExternal(url) : undefined),
      openFolder: (dir) => shell.openPath(dir),
      clearOutput: () => dispatch({ type: 'reset' }),
    };
  }

  function LaravelPanel({ site }) {
    const { state, error, setError, refresh, isMounted } = useSiteState(site.id);
    const { output, dispatch } = useOutput(site.id);
    const [busy, setBusy] = React.useState(null);
    const [notice, setNotice] = React.useState(null);

    /** Runs one action at a time, surfaces errors, then refreshes. Resolves with the result, or null on failure. */
    const run = async (label, task) => {
      setBusy(label);
      setError(null);
      setNotice(null);
      try {
        return (await task()) || {};
      } catch (taskError) {
        if (isMounted.current) {
          setError(taskError.message);
        }
        return null;
      } finally {
        if (isMounted.current) {
          setBusy(null);
          await refresh();
        }
      }
    };

    const laravel = state && state.laravel;
    const header = h('header', { style: styles.header },
      h('div', { style: styles.mark, 'aria-hidden': true }, 'L'),
      h('div', { style: { flex: 1 } },
        h('h2', { style: styles.title }, 'Laravel'),
        h('p', { style: styles.subtitle }, laravel
          ? `Running on ${site.name} with Local's PHP, database and mail.`
          : `Install a Laravel app on ${site.name} using Local's PHP, MySQL and Mailpit.`)),
      state ? h(Badge, { tone: laravel ? 'ok' : 'skipped' }, laravel ? `v${laravel.version || '?'}` : 'Not installed') : null);

    const banners = [
      h(ErrorBanner, { key: 'error', message: error, onDismiss: () => setError(null) }),
      notice ? h(Notice, { key: 'notice', tone: notice.tone }, notice.text) : null,
    ];

    if (!state) {
      return h('div', { style: styles.panel }, header, banners, error ? null : h('p', { style: styles.hint }, 'Checking the site…'));
    }
    const effectiveBusy = busy || state.activeJob;
    const actions = buildActions({ site, state, run, dispatch, setNotice });
    const viewProps = { state, busy: effectiveBusy, output, actions };
    // Laravel's files appear midway through an install; keep showing progress until it finishes.
    const body = laravel && effectiveBusy !== 'install' ? h(ProjectView, viewProps) : h(InstallView, { key: 'install', ...viewProps });
    return h('div', { style: styles.panel }, header, banners, body);
  }

  return LaravelPanel;
}

module.exports = { createLaravelPanel };
