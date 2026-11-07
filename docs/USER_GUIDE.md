# Laravel for Local — User Guide

This guide walks you through installing the add-on, creating your first Laravel app in [Local](https://localwp.com), and day-to-day use: the database, email, Artisan, front-end assets and troubleshooting.

**Contents**

1. [Before you start](#1-before-you-start)
2. [Install the add-on](#2-install-the-add-on)
3. [Create your first Laravel app](#3-create-your-first-laravel-app)
4. [What the installer changes](#4-what-the-installer-changes)
5. [The Laravel tab](#5-the-laravel-tab)
6. [Keeping `.env` in sync with Local](#6-keeping-env-in-sync-with-local)
7. [Running Artisan](#7-running-artisan)
8. [Database](#8-database)
9. [Email with Mailpit](#9-email-with-mailpit)
10. [Front-end assets (Vite)](#10-front-end-assets-vite)
11. [Changing the PHP version](#11-changing-the-php-version)
12. [Removing Laravel from a site](#12-removing-laravel-from-a-site)
13. [Updating or uninstalling the add-on](#13-updating-or-uninstalling-the-add-on)
14. [Troubleshooting](#14-troubleshooting)
15. [FAQ](#15-faq)

---

## 1. Before you start

| You need | Notes |
| --- | --- |
| **Local 6 or newer** | Tested with Local 9 and 10 on Linux. |
| **Node.js 18+** | Only for installing from source. The `.tgz` release needs nothing extra. |
| **Internet access** | The first install downloads Composer (~4 MB) and Laravel's packages. |
| **A PHP version Laravel supports** | Laravel 13 needs **PHP 8.3+**; Laravel 12 needs **PHP 8.2+**. You choose PHP per site in Local. |

You do **not** need PHP, Composer or MySQL installed on your computer. The add-on uses the ones Local already ships with.

## 2. Install the add-on

### Option A: Install from disk (no terminal)

1. Download `local-addon-laravel-<version>.tgz` from the [latest release](https://github.com/shahadul878/local-addon-laravel/releases/latest).
2. In Local, open **Add-ons → Installed** and click **Install from disk**.
3. Select the `.tgz` file, switch the add-on on if needed, and click **Relaunch** when Local asks.

### Option B: From source (Node.js 18+)

1. Download the code:

   ```bash
   git clone https://github.com/shahadul878/local-addon-laravel.git
   ```

   ```bash
   cd local-addon-laravel
   ```

2. Copy it into Local's add-ons folder and enable it:

   ```bash
   npm run install-addon
   ```

   The script finds Local's data folder for you:

   | System | Folder |
   | --- | --- |
   | Linux | `~/.config/Local` |
   | macOS | `~/Library/Application Support/Local` |
   | Windows | `%APPDATA%\Local` |

   If yours is somewhere else, set `LOCAL_USER_DATA` before running it, e.g. `LOCAL_USER_DATA=/path/to/Local npm run install-addon`.

3. **Quit and reopen Local.** Local only loads add-ons when it starts.
4. Check **Add-ons → Installed**. **Laravel** should be listed and switched on. If it is off, switch it on and restart Local again.

> Restarting Local stops every running site. Start the ones you need again afterwards.

## 3. Create your first Laravel app

### Step 1 — Create a site for it

In Local, click **+** → **Create a new site**. Give it a name (e.g. `blog` → `http://blog.local`). Under **Custom** environment, pick:

- **PHP 8.3 or newer** for Laravel 13 (8.2+ for Laravel 12)
- **nginx** or **Apache** (both work)
- **MySQL** (or MariaDB)

Local installs WordPress into the new site. That's fine: the add-on moves it aside, and nothing is deleted.

> **Tip:** use one Local site per Laravel app. You *can* install into an existing WordPress site, but only one of them can be served at a time.

### Step 2 — Start the site

Click **Start site**. MySQL has to be running for the installer to run migrations.

### Step 3 — Open the Laravel tab

Open the site, then **Tools → Laravel**. You'll see two cards.

**Requirements** checks the site before anything changes:

| Check | Green when… | If it's red |
| --- | --- | --- |
| PHP version | The site's PHP meets the chosen Laravel version | Change PHP on the site's **Overview** tab (see [§11](#11-changing-the-php-version)) |
| PHP extensions | All 13 extensions Laravel needs, plus the database driver, are loaded | Pick another PHP version in Local |
| Composer | Already downloaded | Blue "info" just means it will be downloaded and checksum-verified |
| Database | MySQL is running (or you chose SQLite) | Start the site, or untick **Run migrations** |
| Mail | Local's Mailpit is available | Blue "info" means mail stays on Laravel's defaults |
| Web root | `app/public` is empty | Yellow means its current contents (e.g. WordPress) will be **moved** to a backup folder |

**New Laravel app** is the install form:

| Field | What it does |
| --- | --- |
| **Version** | Laravel 13 or 12. The newest one your PHP can run is preselected. |
| **App name** | Becomes `APP_NAME` (shown in page titles and emails). |
| **Database** | **Site's MySQL** (recommended) or **SQLite file** (`database/database.sqlite`). |
| **Database name** | MySQL only. Default `laravel`, kept separate from WordPress's `local` database. It's created on the first migration. |
| **Run migrations after install** | Creates Laravel's default tables (`users`, `cache`, `jobs` and friends). |

### Step 4 — Install

Click **Install Laravel 13** (or 12). If the web root isn't empty you'll be asked to confirm the move first.

The card turns into a live progress view:

1. **Get Composer**: downloaded once, then reused for every site.
2. **Download Laravel**: `composer create-project`, with live output. Usually 10–60 seconds.
3. **Point the web root at Laravel**: moves files into place (see [§4](#4-what-the-installer-changes)).
4. **Write .env for this site**: URL, database, mail.
5. **Run migrations**
6. **Link public storage**: `php artisan storage:link`

When it finishes, the tab switches to the management view. Click **Open site** to see the Laravel welcome page.

> If **Run migrations** or **Link public storage** fails, the install still completes. The step shows a yellow warning and you can retry it from the Artisan card.

## 4. What the installer changes

Local serves every site from `<site>/app/public`. Laravel serves from its own `public/` folder. The add-on lines the two up, so **Local's nginx/Apache config is never edited**:

```
~/Local Sites/blog/
├── app/
│   ├── app/  bootstrap/  config/  database/  routes/  …   ← Laravel
│   ├── public/                   ← Laravel's public/ = Local's web root
│   ├── vendor/  artisan  composer.json  .env
│   ├── public.backup-20261107-171618/   ← the previous web root (e.g. WordPress), untouched
│   └── sql/                      ← Local's own folder, untouched
├── conf/                          ← Local's server config, untouched
└── logs/
```

The `.env` it writes (MySQL example, on Linux/macOS):

```dotenv
APP_NAME="Blog"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://blog.local

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=10255
DB_SOCKET=/home/you/.config/Local/run/<site-id>/mysql/mysqld.sock
DB_DATABASE=laravel
DB_USERNAME=root
DB_PASSWORD=root

MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=10001
```

Why `localhost` and a socket? Local's MySQL only allows `root@localhost`, and it rejects TCP logins from `127.0.0.1`. Connecting through the socket is how WordPress in Local connects too. On Windows, which has no socket, the add-on uses `127.0.0.1` and the port.

## 5. The Laravel tab

Once Laravel is installed, the tab shows:

**App**
- The site URL, with a copy button, plus the app folder, Laravel version, PHP version and web server.
- **Open site**, **Open folder** and **Mailpit inbox** buttons.

**Environment**
- The important `.env` values at a glance.
- An **In sync** or **Out of sync** badge; see [§6](#6-keeping-env-in-sync-with-local).
- **Update .env automatically when the site starts**, which is on by default.

**Artisan**
- One-click commands and a box for any other command; see [§7](#7-running-artisan).
- A terminal that shows live output. **Copy output** in its top-right corner copies everything, which is handy for bug reports.

**Remove**
- Takes Laravel out of the site again; see [§12](#12-removing-laravel-from-a-site).

The header badge shows the installed version, e.g. `v13.40.0`.

## 6. Keeping `.env` in sync with Local

Local can change a site's settings behind your app's back. For example, it reassigns the MySQL or Mailpit port when the old one is taken, and you can rename the domain. When that happens the **Environment** card turns yellow and lists the differences:

```
DB_PORT  10003 → 10010
```

Click **Update .env** to fix it. With auto-update switched on, it's fixed every time the site starts.

Only values that still point at Local are ever changed:

| Key | Updated only when… |
| --- | --- |
| `APP_URL` | It points at a local address (`*.local`, `*.test`, `localhost`). A tunnel or staging URL you set yourself is left alone. |
| `DB_HOST` / `DB_PORT` / `DB_SOCKET` | `DB_CONNECTION=mysql` and the host is `localhost` or `127.0.0.1` |
| `MAIL_PORT` | `MAIL_MAILER=smtp` and the host is local |

If you've cached your config (`php artisan config:cache`), the add-on runs `config:clear` after an update, so Laravel picks up the new values.

## 7. Running Artisan

**One-click buttons**

| Button | Runs |
| --- | --- |
| `migrate` | `php artisan migrate --force` (`--force` lets it create the database if it doesn't exist yet) |
| `migrate:status` | Lists which migrations have run |
| `db:seed` | Runs your seeders |
| `optimize:clear` | Clears the config, route, view and event caches |
| `route:list` | Lists all routes |
| `about` | Shows an overview of the app's environment |

**Any other command:** type it after `php artisan` and press **Run**:

```
make:model Post -m
make:controller PostController --resource
db:seed --class=UserSeeder
```

Notes:
- **Quotes work like in a terminal:** `make:model "Blog Post"`. Commands run directly, never through a shell, so `;`, `&&` and pipes aren't interpreted.
- **No prompts:** commands run with `--no-interaction`, so anything that would ask a question uses its default instead.
- **Long-running or interactive commands are blocked:** `serve`, `tinker`, `queue:work`, `queue:listen`, `schedule:work`, `horizon`, `reverb:start`, `pail` and `octane:start`, including abbreviations like `tink` or `q:w`. Run these from Local's **Site shell** (see below).
- **Stopped site:** database commands (`migrate*`, `db:*`, `schema:*`) stop early with a clear message if the site's database isn't running.

**Site shell.** For anything interactive, use **Site shell** under the site name in Local. It opens a terminal with Local's PHP on the `PATH`, and the Laravel app is in the `app` folder:

```bash
cd app
```

```bash
php artisan tinker
```

## 8. Database

**MySQL (recommended).** The app uses the site's own MySQL server with its own database (`laravel` by default). WordPress's `local` database is never touched.

- **Browse your data:** Local's **Database** tab opens AdminerEvo, where you can pick the `laravel` database.
- **Connect from a desktop client** (TablePlus, DBeaver and so on): host `127.0.0.1`, the port from the **Database** tab, user `root`, password `root`. If the client is refused, use the socket path from `.env` instead.
- **Rebuild from scratch:**

  ```
  migrate:fresh --seed --force
  ```

  This drops every table in the `laravel` database.

**SQLite.** If you chose SQLite, the database is `app/database/database.sqlite`. It works even while the site is stopped.

**Switching later.** Edit the `DB_*` lines in `.env` yourself, then run `migrate --force`.

## 9. Email with Mailpit

Every email your app sends goes to Local's Mailpit, so nothing reaches real inboxes. Open it with **Mailpit inbox** on the Laravel tab, or from **Tools → Mailpit**.

To try it, run a test from **Site shell**:

```bash
cd app
```

```bash
php artisan tinker
```

```php
Mail::raw('Hello from Laravel', fn ($m) => $m->to('test@example.com')->subject('Test'));
```

## 10. Front-end assets (Vite)

Laravel's starter templates use Vite. From **Site shell**:

```bash
cd app
```

```bash
npm install
```

```bash
npm run dev
```

Keep `npm run dev` running while you work, or run `npm run build` once for production assets. Node.js has to be installed on your computer for this; Local doesn't include it.

## 11. Changing the PHP version

On the site's **Overview** tab, change **PHP version**. Local restarts the site with the new version, and the add-on uses it straight away for Composer and Artisan.

Going *down* a version can break an installed app if its `composer.lock` needs a newer PHP. Going up is usually fine.

## 12. Removing Laravel from a site

**Remove Laravel**, at the bottom of the tab, reverses the install:

- Laravel's files move to `app/laravel-removed-<time>/`.
- The previous web root, e.g. WordPress, moves back to `app/public`.
- The `laravel` database is **not** dropped.

Nothing is deleted. Remove the `laravel-removed-…` folder yourself once you're sure.

This button only appears for apps this add-on installed. A Laravel app you put in `app/` yourself is still detected and managed (Environment and Artisan cards), but you have to remove it by hand.

## 13. Updating or uninstalling the add-on

If you installed from a `.tgz`, install the newer `.tgz` the same way, or remove the add-on under **Add-ons → Installed**.

If you installed from source, pull the latest code, reinstall, and restart Local:

```bash
git pull
```

```bash
npm run install-addon
```

To uninstall the add-on, run this and then restart Local. Your Laravel apps and their files stay where they are:

```bash
npm run uninstall-addon
```

The add-on keeps its own data in `<Local data>/laravel/`:

| File | Contents |
| --- | --- |
| `config.json` | Per-site records: what was installed, where the previous web root went, the auto-sync setting |
| `bin/composer.phar` | Composer |
| `addon.log` | A log of installs, syncs and errors |

## 14. Troubleshooting

Start with the log, which records every install, sync and error: `<Local data>/laravel/addon.log`. When asking for help, include **Copy output** from the terminal card.

### "Host '127.0.0.1' is not allowed to connect to this MySQL server" (error 1130)

The app is connecting over TCP, which Local's MySQL refuses for `root`. Click **Update .env**. It switches `DB_HOST` to `localhost` and adds `DB_SOCKET`. Apps installed with version 1.0.0 or later are set up this way already.

### "SQLSTATE[HY000] [2002] No such file or directory"

The site's MySQL isn't running, so its socket file doesn't exist. Click **Start site**. This often happens right after restarting Local, which stops all sites.

### "Unknown database 'laravel'" (error 1049)

The database hasn't been created yet. Run the **migrate** button, which passes `--force` so Laravel creates it.

### "Laravel 13 needs PHP 8.3+"

Change the site's PHP version on the **Overview** tab, or choose Laravel 12.

### "Missing: pdo_mysql, …"

That PHP build in Local lacks an extension. Pick another PHP version, or use SQLite if only `pdo_mysql` is missing.

### "Could not download Composer"

The computer couldn't reach `getcomposer.org`. Check your internet connection or proxy, then try again. If the download is corrupted, it fails the checksum check and is thrown away; it's never used.

### "These already exist in …/app: …"

Files in `app/` have the same names as Laravel's (for example a `composer.json` you left there). Move them out and install again. Nothing was changed.

### The site shows a 404 or WordPress after installing

- Reload the browser without the cache.
- Check that `app/public/index.php` is Laravel's (it mentions `bootstrap/app.php`).
- If you added custom nginx rules for WordPress, review `conf/nginx/site.conf.hbs`.

### "The install stopped…"

The failed step is marked red, and the log above it shows why. If the failure happened before the web-root step, the site wasn't changed. Fix the cause, click **Back to form**, and install again.

### The Laravel tab doesn't appear

- Make sure **Add-ons → Installed → Laravel** is switched on.
- Restart Local.
- Check that `<Local data>/addons/local-addon-laravel/package.json` exists.

## 15. FAQ

**Can WordPress and Laravel run in the same site?**
Not at the same time: one web root, one app. The WordPress files are kept in `app/public.backup-…`, and **Remove Laravel** puts them back.

**Does it work with Apache sites?**
Yes. Laravel's `public/.htaccess` handles the rewrites.

**Can I use an existing Laravel project?**
Yes. Put its files in `<site>/app` so that its `public/` is `app/public`, and run `composer install`. The tab detects it and you can use Environment sync and Artisan.

**HTTPS?**
Use Local's **Trust** button on the SSL row of the site's Overview tab. Then set `APP_URL=https://…` yourself. Auto-sync won't change it back, because the host still matches.

**PostgreSQL?**
Not built in. If you run PostgreSQL for the site separately, edit `DB_*` in `.env`. Auto-sync leaves non-MySQL connections alone.

**Is this an official Laravel or Local product?**
No. It's an independent, open-source add-on. Laravel is a trademark of Laravel Holdings Inc.; Local is a product of WP Engine.
