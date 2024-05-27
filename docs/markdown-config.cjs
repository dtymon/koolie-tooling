const base = require('./base-config.cjs');

module.exports = {
  ...base,
  plugin: [...base.plugin, 'typedoc-plugin-markdown'],
  out: './markdown-docs'
};
