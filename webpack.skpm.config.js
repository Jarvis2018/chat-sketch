'use strict'

const webpack = require('webpack')

/**
 * CHAT_SKETCH_USE_LOCAL_PANEL=1 → panel loads http://localhost:3000 (Vite dev).
 * Production `npm run build` omits this → bundled dist/index.html.
 */
module.exports = async function (config /*, entry */) {
  const useLocal = process.env.CHAT_SKETCH_USE_LOCAL_PANEL === '1'
  config.plugins.push(
    new webpack.DefinePlugin({
      __CHAT_SKETCH_USE_LOCAL_PANEL__: JSON.stringify(useLocal),
    })
  )
}
