# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chat Sketch is a Sketch plugin (macOS) that provides an AI-powered UI design assistant. It allows users to describe designs in natural language (Chinese), generates HTML previews using Claude AI, and converts them into native Sketch layers.

**Architecture**: The project has two parts:
1. **Plugin** (`src/`): Sketch plugin code using `skpm` build system
2. **Web Panel** (`web-panel/`): Vue 3 web UI served via Vite, running inside a Sketch web view

## Development Commands

### Plugin (root directory)
```bash
npm run build      # Build the Sketch plugin
npm run watch      # Watch for changes and rebuild
npm run start      # Build, watch, and auto-run the plugin in Sketch
```

### Web Panel (`web-panel/` directory)
```bash
npm run dev        # Start Vite dev server on port 3000 (required for development)
npm run build      # Build production bundle
```

### Debugging
```bash
skpm log -f        # Stream plugin logs to terminal
```

Install [sketch-dev-tools](https://github.com/skpm/sketch-dev-tools) for debugging the web view.

## Development Workflow

1. The plugin loads the web UI from `http://localhost:3000` during development
2. **Both processes must be running**: `npm run dev` in `web-panel/` and `npm run start` in root
3. Plugin shortcut: `Ctrl+Shift+C` opens the panel
4. The web view communicates with the plugin via `window.postMessage` through `sketch-module-web-view`

## Data Flow

1. User enters design description in Vue web panel (`App.vue`)
2. Web panel sends `generate-html` event to plugin (`handler.js`)
3. Plugin spawns `claude` CLI via `NSTask` (`claude-client.js`)
4. Claude generates HTML code
5. HTML is displayed in preview modal (`HTMLPreviewModal.vue`)
6. User clicks "Convert to Sketch"
7. `html2sketch` library converts HTML DOM to Sketch JSON format
8. Plugin creates native Sketch layers via recursive JSON parsing (`design-api.js`)

## Architecture Details

### Plugin-to-Web Communication
The plugin uses `sketch-module-web-view` to host the Vue UI. Communication flows through `window.postMessage`:
- Web panel calls `window.postMessage(eventName, params)` to invoke plugin handlers
- Plugin listens via `webContents.on(eventName, handler)` in `handler.js`
- Events: `generate-html`, `convert-to-sketch`, `get-status`

### HTML-to-Sketch Conversion Pipeline
1. **HTML Generation**: Claude CLI generates complete HTML with inline CSS
2. **DOM-to-JSON**: `html2sketch`'s `nodeToGroup()` converts DOM to Sketch-compatible JSON structure
3. **SVG Handling**: SVG elements are extracted and marked with `_isSVGImport` flag for native import via `sketch.createLayerFromData()`
4. **Layer Creation**: `createLayerFromJSON()` recursively builds native Sketch layers using the Sketch JavaScript API

### Layer Type Mapping
The `design-api.js` handles these html2sketch output types:
- `artboard` → `sketch.Artboard`
- `group` → `sketch.Group` (with special handling for SVG imports)
- `text` → `sketch.Text` (with font, color, alignment parsing)
- `rectangle` → `sketch.Shape` (with fills, borders, corner radius, shadows)
- `shapeGroup` → `sketch.Group` (container for vector shapes)
- `shapePath` → `sketch.ShapePath` (with bezier curve support)
- `bitmap`/`image` → `sketch.Image` (with base64 data support)

## Key Files

- `src/manifest.json`: Plugin manifest defining commands and UI configuration
- `src/handler.js`: Main entry point, web view event handlers
- `src/claude-client.js`: Claude CLI integration via macOS `NSTask`
- `src/design-api.js`: Sketch layer creation using `MSJSONDictionaryUnarchiver`
- `web-panel/src/App.vue`: Main chat interface
- `web-panel/src/components/HTMLPreviewModal.vue`: HTML preview and conversion modal

## Claude CLI Integration

The plugin calls the Claude CLI with these flags:
```bash
claude --dangerously-skip-permissions --tools "" -p "<prompt>"
```

Requires the `claude` CLI to be installed and in PATH (`$HOME/.local/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`).

## Important Notes

- The UI and system prompts are in Chinese
- Default artboard size is 375x812 (iPhone X dimensions)
- The `html2sketch` library requires Node.js polyfills (configured in `vite.config.js`)
- Coordinate system: html2sketch outputs normalized coordinates (0-1 range) which are denormalized using frame dimensions during layer creation
