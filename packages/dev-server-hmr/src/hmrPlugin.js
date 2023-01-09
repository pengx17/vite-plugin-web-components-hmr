/** @typedef {import('vite').Plugin} DevServerPlugin */
/** @typedef {import('./utils').Matcher} Matcher */

/**
 * @typedef {object} BaseClass
 * @property {string} name
 * @property {string} [import]
 */

/**
 * @typedef {object} Decorator
 * @property {string} name
 * @property {string} [import]
 */

/**
 * @typedef {object} FunctionOption
 * @property {string} name
 * @property {string} [import]
 */

/**
 * @typedef {object} Preset
 * @property {BaseClass[]} baseClasses
 * @property {Decorator[]} decorators
 * @property {string} patch
 */

/**
 * @typedef {object} WcHmrPluginConfig
 * @property {string[]} [include]
 * @property {string[]} [exclude]
 * @property {Preset[]} [presets]
 * @property {BaseClass[]} [baseClasses]
 * @property {Decorator[]} [decorators]
 * @property {FunctionOption[]} [functions]
 * @property {string[]} [patches]
 */

const fs = require('fs')
const path = require('path')
const { babelTransform } = require('./babel/babelTransform.js')
const { parseConfig, createMatchers, createError } = require('./utils.js')
const {
  WC_HMR_MODULE_PREFIX,
  WC_HMR_MODULE_RUNTIME,
  WC_HMR_MODULE_PATCH,
} = require('./constants.js')

const wcHmrRuntime = fs.readFileSync(
  path.resolve(__dirname, 'wcHmrRuntime.js'),
  'utf-8'
)

/**
 * @param {WcHmrPluginConfig} pluginConfig
 * @returns {DevServerPlugin}
 */
function hmrPlugin(pluginConfig) {
  let shouldSkipHmr = false

  /** @type {string} */
  let rootDir
  /** @type {Matcher} */
  let matchInclude = () => true
  /** @type {Matcher} */
  let matchExclude = () => false

  const parsedPluginConfig = parseConfig(pluginConfig)

  return {
    name: 'lit-hrm',
    configResolved(config) {
      shouldSkipHmr = config.command === 'build' || config.isProduction
      rootDir = config.root
    },
    configureServer(server) {
      if (parsedPluginConfig.include) {
        matchInclude = createMatchers(rootDir, parsedPluginConfig.include)
      }

      if (parsedPluginConfig.exclude) {
        matchExclude = createMatchers(rootDir, parsedPluginConfig.exclude)
      }

      return
    },
    // handleHotUpdate(ctx) {
    //   ctx.server.ws.send({
    //     type: 'custom',
    //     event: 'special-update',
    //     data: {}
    //   })
    //   return []
    // },
    resolveId(id) {
      if (id.startsWith(WC_HMR_MODULE_PREFIX)) {
        return id
      }
    },
    load(id) {
      if (id === WC_HMR_MODULE_RUNTIME) {
        return wcHmrRuntime
      }

      if (id === WC_HMR_MODULE_PATCH) {
        return (
          (parsedPluginConfig.patches &&
            parsedPluginConfig.patches.join('\n')) ||
          ''
        )
      }
    },
    async transform(code, id, options) {
      if (shouldSkipHmr) return

      const filePath = id
      if (id.startsWith('/__web-dev-server__')) {
        return
      }

      let transformedCode = code

      if (
        matchInclude(filePath) &&
        !matchExclude(filePath) &&
        !filePath.startsWith('__web-dev-server__') &&
        typeof code === 'string'
      ) {
        try {
          transformedCode = await babelTransform(code, filePath, {
            baseClasses: parsedPluginConfig.baseClasses,
            decorators: parsedPluginConfig.decorators,
            functions: parsedPluginConfig.functions,
            patches: parsedPluginConfig.patches,
            rootDir,
          })

          return transformedCode
        } catch (/** @type {any} */ error) {
          if (error.name === 'SyntaxError') {
            // forward babel error to dev server
            const strippedMsg = error.message.replace(
              new RegExp(`${filePath} ?:? ?`, 'g'),
              ''
            )
            // throw new PluginSyntaxError(
            //   strippedMsg,
            //   filePath,
            //   error.code,
            //   error.loc,
            //   error.pos
            // )
            console.error(
              `PluginSyntaxError` +
                [strippedMsg, filePath, error.code, error.loc, error.pos]
                  .map((v) => JSON.stringify(v))
                  .join('\n')
            )
          }
        }
      }

      return transformedCode
    },
    // transformIndexHtml() {},
  }
}

module.exports = { hmrPlugin }