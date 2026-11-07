# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-07

First public release.

### Added
- **Tools → Laravel** tab on every Local site.
- Requirement checks before installing: PHP version per Laravel release, required PHP extensions, database availability, web-root contents.
- One-click install of **Laravel 13** or **Laravel 12** using the site's own PHP, with live Composer output and a step-by-step checklist.
- A private, SHA-256-verified `composer.phar`, downloaded once and run on the site's PHP.
- The web root swap: Laravel lives in `<site>/app`, so its `public/` becomes Local's web root. The previous web root (e.g. WordPress) is moved to `app/public.backup-<time>`, and nothing is deleted.
- `.env` pre-configured for Local: `APP_URL`, the site's MySQL over its unix socket (or SQLite), and Mailpit SMTP.
- `key:generate`, `migrate` and `storage:link` run after install. A failed migration or storage link is a warning, not a failed install.
- `.env` sync: spots when Local has changed ports or the domain, fixes it with one click, or automatically on site start. Only values that still point at Local are touched.
- An Artisan runner with one-click commands, free-form input (quotes supported, no shell), a live terminal and **Copy output**.
- Long-running or interactive commands (`serve`, `tinker`, `queue:work`, …) are blocked, including their abbreviations.
- Database commands on a stopped site fail early with a plain explanation.
- **Remove Laravel**: moves the app to `app/laravel-removed-<time>` and restores the previous web root.
- An install script (`npm run install-addon` / `link-addon` / `uninstall-addon`) for Linux, macOS and Windows.
