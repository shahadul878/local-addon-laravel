# Contributing

Thanks for helping improve Laravel for Local! Bug reports, fixes and ideas are all welcome.

## Reporting a bug

Open an [issue](https://github.com/shahadul878/local-addon-laravel/issues/new/choose) and include:

- your OS, Local version, the site's PHP / MySQL versions and the web server (nginx or Apache)
- what you clicked and what you expected
- the terminal output (use **Copy output** in the Laravel tab)
- the relevant lines from `<Local data>/laravel/addon.log`

## Development setup

```bash
git clone https://github.com/shahadul878/local-addon-laravel.git
```

```bash
cd local-addon-laravel
```

```bash
npm install
```

```bash
npm run link-addon
```

`link-addon` symlinks your working copy into Local, so you only need to restart Local to pick up changes.

## Tests

```bash
npm test
```

```bash
npm run coverage
```

Tests use Node's built-in test runner and need no PHP, Local or network. The service layer gets its file system, processes and ports injected, so whole install / sync / uninstall flows run against temporary folders.

## Guidelines

- **Plain CommonJS, no build step.** `lib/main.js` runs in Local's Electron main process; `lib/renderer.js` and `lib/ui/` run in the renderer with Local's React 16 (passed in, never imported).
- **Never delete a user's files.** Move them aside (`public.backup-…`, `laravel-removed-…`) and say where they went.
- **Never use a shell.** Run processes with an argument array (`lib/processRunner.js`).
- **Validate anything coming over IPC** (`lib/validation.js`).
- **Keep functions small and data immutable.** Return new objects instead of changing existing ones.
- **Add or update tests** with every behaviour change, and keep coverage above 80%.
- **Commit messages** follow `type: description` (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`).

## Project layout

See the *Development* section of the [README](README.md#development).
