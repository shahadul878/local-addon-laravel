'use strict';

const { createApi } = require('./ui/api');
const { createLaravelPanel } = require('./ui/LaravelPanel');

const TOOLS_PATH = '/laravel';

/**
 * Renderer entry point. Adds a "Laravel" tab to each site's Tools section.
 * Local instantiates this with `new`, so it must be a regular function.
 */
module.exports = function LaravelAddonRenderer(context) {
  const { React, hooks, electron } = context;
  const LaravelPanel = createLaravelPanel(React, {
    api: createApi(electron.ipcRenderer),
    clipboard: electron.clipboard,
    shell: electron.shell,
    confirm: (message) => window.confirm(message),
  });

  hooks.addFilter('siteInfoToolsItem', (items, { routeChildrenProps } = {}) => {
    const site = routeChildrenProps && routeChildrenProps.site;
    if (!site) {
      return items;
    }
    return [
      ...items,
      {
        path: TOOLS_PATH,
        menuItem: 'Laravel',
        render: () => React.createElement(LaravelPanel, { key: site.id, site }),
      },
    ];
  });
};
