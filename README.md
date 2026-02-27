# Chat Sketch

> AI-powered Sketch plugin that generates high-fidelity UI designs from natural language descriptions

## ✨ Features

- 🤖 **AI-Powered**: Uses Claude CLI to generate HTML designs from text descriptions
- 🎨 **Live Preview**: Preview generated HTML before converting to Sketch
- 📱 **Multi-Device**: Supports iOS, Android, and web design patterns
- 🛡️ **Rock Solid**: Completely stable with proper resource management
- 🚀 **Full Featured**: Preserves all styles - corners, shadows, gradients, SVGs
- ⚡ **Fast Iteration**: Generate multiple design variations quickly

## 🎉 Crash Issue Fixed!

**Status**: ✅ Fully resolved - tested and confirmed stable

The plugin previously had crash issues with complex designs. This has been **completely fixed** through proper resource management:

- ✅ No more crashes on complex designs
- ✅ No more crashes on second/third conversions
- ✅ All styles preserved (corners, shadows, gradients, SVGs)
- ✅ Supports any complexity level

**Technical solution**: Enhanced garbage collection + proper delays + batch processing cleanup

📖 **Read more**: [Final Solution](./FINAL_SOLUTION.md)

## 📦 Installation

1. [Download](../../releases/latest/download/chat-sketch.sketchplugin.zip) the latest release
2. Unzip the file
3. Double-click `chat-sketch.sketchplugin` to install
4. Make sure [Claude CLI](https://claude.ai/download) is installed and available in your PATH

## 🎯 Quick Start

1. Open Sketch and run the plugin (Plugins → Chat Sketch)
2. Describe your design in natural language:
   ```
   Create a login page with:
   - Title "Welcome Back"
   - Username input field
   - Password input field
   - Blue login button with rounded corners
   - "Forgot password?" link at bottom
   ```
3. Click "Generate" to preview the HTML
4. Click "Convert to Sketch" to create the design
5. Done! All styles are preserved (corners, shadows, etc.)

## ⚠️ Complexity Warnings

For very complex designs (200+ elements), you may see a warning:

```
⚠️ 设计较复杂：
• 预计生成 350 个图层，较多但会尝试转换
• 转换可能需要较长时间

是否继续？
```

This is just a heads-up, not an error. Click "OK" to continue - the conversion will work fine, just may take a few seconds longer.

## 📚 Documentation

- [Final Solution](./FINAL_SOLUTION.md) - Complete fix for crash issues ✅
- [Crash Fix Documentation](./CRASH_FIX.md) - Technical details about stability fixes
- [Testing Guide](./TESTING_GUIDE.md) - How to test the plugin
- [Quick Reference](./QUICK_REFERENCE.md) - Quick reference for developers

### Legacy Documentation (No Longer Needed)

These were created during troubleshooting but are no longer necessary:
- [Safe Mode Guide](./SAFE_MODE_GUIDE.md) - Safe mode is available but not needed
- [Complexity Limits](./COMPLEXITY_LIMITS.md) - Limits are now much more relaxed
- [Solution Summary](./SOLUTION_SUMMARY.md) - Superseded by Final Solution

## 🔧 Advanced Configuration

### Safe Mode (Optional)

Safe mode is available but **not needed** anymore. The crash issue has been fixed through proper resource management.

If you still want to use safe mode (minimal styling), edit `src/handler.js`:

```javascript
const USE_SAFE_MODE = true  // Change to true
```

Then rebuild:
```bash
npm run build
```

Safe mode creates basic layouts without styling, which you then complete manually in Sketch.

## 🛠️ Development

## Installation

- [Download](../../releases/latest/download/chat-sketch.sketchplugin.zip) the latest release of the plugin
- Un-zip
- Double-click on chat-sketch.sketchplugin

## Development Guide

_This plugin was created using `skpm`. For a detailed explanation on how things work, checkout the [skpm Readme](https://github.com/skpm/skpm/blob/master/README.md)._

### Usage

Install the dependencies

```bash
npm install
```

Once the installation is done, you can run some commands inside the project folder:

```bash
npm run build
```

To watch for changes:

```bash
npm run watch
```

Additionally, if you wish to run the plugin every time it is built:

```bash
npm run start
```

### Custom Configuration

#### Babel

To customize Babel, you have two options:

- You may create a [`.babelrc`](https://babeljs.io/docs/usage/babelrc) file in your project's root directory. Any settings you define here will overwrite matching config-keys within skpm preset. For example, if you pass a "presets" object, it will replace & reset all Babel presets that skpm defaults to.

- If you'd like to modify or add to the existing Babel config, you must use a `webpack.skpm.config.js` file. Visit the [Webpack](#webpack) section for more info.

#### Webpack

To customize webpack create `webpack.skpm.config.js` file which exports function that will change webpack's config.

```js
/**
 * Function that mutates original webpack config.
 * Supports asynchronous changes when promise is returned.
 *
 * @param {object} config - original webpack config.
 * @param {boolean} isPluginCommand - whether the config is for a plugin command or a resource
 **/
module.exports = function(config, isPluginCommand) {
  /** you can change config here **/
}
```

### Debugging

To view the output of your `console.log`, you have a few different options:

- Use the [`sketch-dev-tools`](https://github.com/skpm/sketch-dev-tools)
- Run `skpm log` in your Terminal, with the optional `-f` argument (`skpm log -f`) which causes `skpm log` to not stop when the end of logs is reached, but rather to wait for additional data to be appended to the input

### Publishing your plugin

```bash
skpm publish <bump>
```

(where `bump` can be `patch`, `minor` or `major`)

`skpm publish` will create a new release on your GitHub repository and create an appcast file in order for Sketch users to be notified of the update.

You will need to specify a `repository` in the `package.json`:

```diff
...
+ "repository" : {
+   "type": "git",
+   "url": "git+https://github.com/ORG/NAME.git"
+  }
...
```
