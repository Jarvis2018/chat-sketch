import sketch from 'sketch'

/**
 * ULTRA SAFE MODE - Minimal layer creation to prevent crashes
 * Only creates basic rectangles and text, no styling, no complex APIs
 */

/**
 * Convert html2sketch JSON to Sketch layers using ULTRA SAFE approach
 * @param {Object} sketchJSON - The Sketch JSON from html2sketch
 * @param {Object} page - Target Sketch page
 * @returns {Object} - Created root group
 */
export function convertToSketchSafeMode(sketchJSON, page) {
  console.log('[SafeMode] Starting ULTRA SAFE conversion')
  console.log('[SafeMode] Input JSON class:', sketchJSON._class)
  
  try {
    // Create root group (NOT artboard - artboards cause crashes)
    const rootGroup = new sketch.Group({
      parent: page,
      name: sketchJSON.name || 'Design (Safe Mode)',
      frame: {
        x: 0,
        y: 0,
        width: sketchJSON.frame?.width || 375,
        height: sketchJSON.frame?.height || 812
      }
    })
    
    console.log('[SafeMode] Root group created:', rootGroup.id)
    
    // Add background if specified
    if (sketchJSON.backgroundColor) {
      try {
        new sketch.Shape({
          parent: rootGroup,
          name: 'Background',
          frame: {
            x: 0,
            y: 0,
            width: sketchJSON.frame?.width || 375,
            height: sketchJSON.frame?.height || 812
          },
          style: {
            fills: [{
              color: sketchJSON.backgroundColor.value || '#FFFFFF'
            }]
          }
        })
        console.log('[SafeMode] Background added')
      } catch (e) {
        console.log('[SafeMode] Background creation failed (non-critical):', e.message)
      }
    }
    
    // Process layers with ULTRA SAFE approach
    if (sketchJSON.layers && sketchJSON.layers.length > 0) {
      console.log('[SafeMode] Processing', sketchJSON.layers.length, 'layers')
      processLayersSafe(sketchJSON.layers, rootGroup, 0)
    }
    
    console.log('[SafeMode] Conversion complete')
    return rootGroup
    
  } catch (error) {
    console.error('[SafeMode] Fatal error:', error)
    throw error
  }
}

/**
 * Process layers with ULTRA SAFE approach - only basic shapes and text
 * @param {Array} layers - Array of layer JSON objects
 * @param {Object} parent - Parent Sketch layer
 * @param {number} depth - Current recursion depth
 */
function processLayersSafe(layers, parent, depth) {
  // Hard limit on depth to prevent stack overflow
  if (depth > 10) {
    console.warn('[SafeMode] Max depth reached, stopping recursion')
    return
  }
  
  // Hard limit on layer count
  if (depth === 0 && layers.length > 50) {
    console.warn('[SafeMode] Too many layers, processing first 50 only')
    layers = layers.slice(0, 50)
  }
  
  for (let i = 0; i < layers.length; i++) {
    const layerJSON = layers[i]
    
    try {
      createLayerSafe(layerJSON, parent, depth)
    } catch (e) {
      console.warn('[SafeMode] Failed to create layer:', layerJSON.name, e.message)
      // Continue with next layer instead of crashing
    }
  }
}

/**
 * Create a single layer using ULTRA SAFE approach
 * @param {Object} layerJSON - Layer JSON from html2sketch
 * @param {Object} parent - Parent Sketch layer
 * @param {number} depth - Current recursion depth
 */
function createLayerSafe(layerJSON, parent, depth) {
  const layerClass = layerJSON._class
  const frame = layerJSON.frame || { x: 0, y: 0, width: 100, height: 100 }
  
  // Validate frame
  if (!frame.width || frame.width < 1) frame.width = 100
  if (!frame.height || frame.height < 1) frame.height = 100
  if (frame.x < -10000 || frame.x > 10000) frame.x = 0
  if (frame.y < -10000 || frame.y > 10000) frame.y = 0
  
  console.log('[SafeMode] Creating:', layerClass, layerJSON.name)
  
  switch (layerClass) {
    case 'text':
      createTextSafe(layerJSON, parent, frame)
      break
      
    case 'rectangle':
    case 'oval':
    case 'shapePath':
    case 'shapeGroup':
      // All shapes become simple rectangles
      createRectangleSafe(layerJSON, parent, frame)
      break
      
    case 'group':
    case 'artboard':
      // Groups are created, but with minimal nesting
      createGroupSafe(layerJSON, parent, frame, depth)
      break
      
    default:
      // Unknown types become rectangles
      console.log('[SafeMode] Unknown type, creating rectangle:', layerClass)
      createRectangleSafe(layerJSON, parent, frame)
  }
}

/**
 * Create text layer - ULTRA SAFE (minimal styling)
 */
function createTextSafe(layerJSON, parent, frame) {
  try {
    // Extract text content
    let textContent = 'Text'
    try {
      textContent = layerJSON.attributedString?.string || layerJSON.name || 'Text'
    } catch (e) {
      console.log('[SafeMode] Could not extract text content')
    }
    
    // Create with minimal properties - NO STYLING
    const textLayer = new sketch.Text({
      parent: parent,
      name: layerJSON.name || 'Text',
      text: textContent,
      frame: {
        x: frame.x,
        y: frame.y,
        width: Math.max(10, frame.width),
        height: Math.max(10, frame.height)
      }
    })
    
    // Try to apply ONLY font size (safest property)
    try {
      const fontSize = layerJSON.style?.textStyle?.encodedAttributes?.MSAttributedStringFontAttribute?.attributes?.size
      if (fontSize && fontSize > 0 && fontSize < 200) {
        textLayer.style.fontSize = fontSize
      }
    } catch (e) {
      // Ignore styling errors
    }
    
    console.log('[SafeMode] Text created:', textLayer.id)
    
  } catch (e) {
    console.error('[SafeMode] Text creation failed:', e.message)
    // Create fallback rectangle
    createRectangleSafe({ name: 'Text (Error)' }, parent, frame)
  }
}

/**
 * Create rectangle - ULTRA SAFE (no styling)
 */
function createRectangleSafe(layerJSON, parent, frame) {
  try {
    // Create plain rectangle with NO STYLING
    const rect = new sketch.Shape({
      parent: parent,
      name: layerJSON.name || 'Shape',
      frame: {
        x: frame.x,
        y: frame.y,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height)
      }
    })
    
    // Try to apply ONLY fill color (safest style property)
    try {
      const fills = layerJSON.style?.fills
      if (fills && fills.length > 0 && fills[0].color) {
        const color = fills[0].color
        if (color.red !== undefined) {
          // Sketch color format
          const r = Math.round(color.red * 255)
          const g = Math.round(color.green * 255)
          const b = Math.round(color.blue * 255)
          const a = color.alpha !== undefined ? color.alpha : 1
          rect.style.fills = [{ color: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`, fillType: 'Color' }]
        }
      }
    } catch (e) {
      // Ignore styling errors - leave as default gray
    }
    
    console.log('[SafeMode] Rectangle created:', rect.id)
    
  } catch (e) {
    console.error('[SafeMode] Rectangle creation failed:', e.message)
  }
}

/**
 * Create group - ULTRA SAFE (minimal nesting)
 */
function createGroupSafe(layerJSON, parent, frame, depth) {
  try {
    // Create group
    const group = new sketch.Group({
      parent: parent,
      name: layerJSON.name || 'Group',
      frame: {
        x: frame.x,
        y: frame.y,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height)
      }
    })
    
    console.log('[SafeMode] Group created:', group.id)
    
    // Process children (with depth limit)
    if (layerJSON.layers && layerJSON.layers.length > 0 && depth < 10) {
      processLayersSafe(layerJSON.layers, group, depth + 1)
    }
    
  } catch (e) {
    console.error('[SafeMode] Group creation failed:', e.message)
  }
}
