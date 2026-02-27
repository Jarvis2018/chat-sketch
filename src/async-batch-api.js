import sketch from 'sketch'

/**
 * Async Batch Conversion - Create layers in small batches with delays
 * This prevents Sketch from crashing when processing complex designs
 */

const BATCH_SIZE = 10
const BATCH_DELAY = 1200
const MAX_LAYERS = 2000
const MAX_DEPTH = 30

var globalLayerCount = 0
var totalEstimatedLayers = 0

/**
 * Convert html2sketch JSON to Sketch layers using async batch approach
 * @param {Object} sketchJSON - The Sketch JSON from html2sketch
 * @param {Object} page - Target Sketch page
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} - Created root artboard
 */
export function convertToSketchAsyncBatch(sketchJSON, page, progressCallback) {
  return new Promise(function(resolve, reject) {
    console.log('[AsyncBatch] Starting async batch conversion')
    
    // Reset counters
    globalLayerCount = 0
    totalEstimatedLayers = estimateLayerCount(sketchJSON)
    
    console.log('[AsyncBatch] Estimated layers:', totalEstimatedLayers)
    
    try {
      // Create root artboard (not group)
      const rootArtboard = new sketch.Artboard({
        parent: page,
        name: sketchJSON.name || 'Generated Design',
        frame: {
          x: 0,
          y: 0,
          width: sketchJSON.frame?.width || 375,
          height: sketchJSON.frame?.height || 812
        }
      })
      
      console.log('[AsyncBatch] Root artboard created')
      
      // CRITICAL: Remove artboard border
      try {
        rootArtboard.style.borders = []
        console.log('[AsyncBatch] Removed artboard border')
      } catch (e) {
        console.log('[AsyncBatch] Failed to remove artboard border:', e.message)
      }
      
      // Set background color if specified
      if (sketchJSON.backgroundColor) {
        try {
          rootArtboard.background.enabled = true
          rootArtboard.background.color = sketchJSON.backgroundColor.value || '#FFFFFF'
        } catch (e) {
          console.log('[AsyncBatch] Background color setting failed:', e.message)
        }
      }
      
      // Flatten all layers into a queue
      const layerQueue = flattenLayers(sketchJSON.layers || [], rootArtboard, null, 0)
      console.log('[AsyncBatch] Total layers in queue:', layerQueue.length)
      
      // Update progress
      if (progressCallback) {
        progressCallback({
          current: 0,
          total: layerQueue.length,
          message: '准备创建图层...'
        })
      }
      
      // Process queue in batches
      processBatchQueue(layerQueue, 0, progressCallback, function(error) {
        if (error) {
          reject(error)
        } else {
          console.log('[AsyncBatch] All batches completed')
          resolve(rootArtboard)
        }
      })
      
    } catch (error) {
      console.error('[AsyncBatch] Fatal error:', error)
      reject(error)
    }
  })
}

/**
 * Estimate total layer count
 */
function estimateLayerCount(json) {
  var count = 1
  if (json.layers && Array.isArray(json.layers)) {
    json.layers.forEach(function(layer) {
      count += estimateLayerCount(layer)
    })
  }
  return count
}

/**
 * Flatten layer hierarchy into a queue with parent references
 */
function flattenLayers(layers, parent, parentFrame, depth) {
  var queue = []
  
  if (depth > MAX_DEPTH) {
    console.warn('[AsyncBatch] Max depth reached, stopping')
    return queue
  }
  
  // Keep original order - html2sketch already has correct z-order
  // (bottom layers first, top layers last)
  var sortedLayers = layers.slice()
  
  sortedLayers.forEach(function(layerJSON) {
    // Skip invalid layers
    if (!layerJSON || !layerJSON._class) return
    
    // Skip tiny layers
    if (layerJSON.frame && (layerJSON.frame.width < 0.1 || layerJSON.frame.height < 0.1)) {
      return
    }
    
    queue.push({
      json: layerJSON,
      parent: parent,
      parentFrame: parentFrame,
      depth: depth
    })
    
    // If this layer has children, check if we should process them
    if (layerJSON.layers && layerJSON.layers.length > 0) {
      // CRITICAL: If this is an SVG import marker, don't process children
      // The children are html2sketch's fallback shapes that will be replaced by actual SVG
      var isSVGImport = (layerJSON._class === 'group' && 
                        layerJSON.name === 'svg' && 
                        layerJSON._isSVGImport && 
                        layerJSON._svgString)
      
      if (isSVGImport) {
        console.log('[AsyncBatch] Detected SVG import marker, skipping children (will be replaced by actual SVG)')
        // Mark this item to skip children processing
        queue[queue.length - 1].skipChildren = true
      } else {
        // Normal layer with children
        queue[queue.length - 1].hasChildren = true
        queue[queue.length - 1].childrenJSON = layerJSON.layers
      }
    }
  })
  
  return queue
}

/**
 * Process queue in batches with delays
 */
function processBatchQueue(queue, startIndex, progressCallback, callback) {
  if (startIndex >= queue.length) {
    // All done
    callback(null)
    return
  }
  
  if (globalLayerCount >= MAX_LAYERS) {
    console.warn('[AsyncBatch] Max layers reached, stopping')
    callback(null)
    return
  }
  
  // Process one batch (adaptive batch size keeps large conversions stable)
  var batchSize = getAdaptiveBatchSize(queue.length)
  var endIndex = Math.min(startIndex + batchSize, queue.length)
  var batch = queue.slice(startIndex, endIndex)
  
  console.log('[AsyncBatch] Processing batch', startIndex, '-', endIndex, 'of', queue.length)
  
  // Update progress
  if (progressCallback) {
    var percent = Math.round((startIndex / queue.length) * 100)
    progressCallback({
      current: startIndex,
      total: queue.length,
      percent: percent,
      message: '创建图层 ' + startIndex + '/' + queue.length + ' (' + percent + '%)'
    })
  }
  
  // Create layers in this batch
  var createdGroups = []
  batch.forEach(function(item) {
    try {
      var layer = createSingleLayer(item.json, item.parent, item.parentFrame, item.depth)
      
      if (layer) {
        globalLayerCount++
        
        // If this layer has children and we should process them, queue them for next batches
        // Skip children if this was an SVG import (children are fallback shapes)
        if (item.hasChildren && item.childrenJSON && !item.skipChildren) {
          // Pass shapeGroup fill metadata to children so shapePath can inherit it.
          var childQueue = flattenLayers(item.childrenJSON, layer, item.json.frame, item.depth + 1)
          // Insert children into queue after current batch
          queue.splice.apply(queue, [endIndex, 0].concat(childQueue))
        }
      }
    } catch (e) {
      console.error('[AsyncBatch] Error creating layer:', item.json.name, e.message)
    }
  })
  
  // Force GC after each batch
  if (typeof global !== 'undefined' && global.gc) {
    try {
      global.gc()
      console.log('[AsyncBatch] Forced GC after batch')
    } catch (e) {
      // GC not available
    }
  }
  
  // Wait before next batch
  setTimeout(function() {
    processBatchQueue(queue, endIndex, progressCallback, callback)
  }, BATCH_DELAY)
}

function getAdaptiveBatchSize(totalLayers) {
  if (totalLayers > 1500) return 4
  if (totalLayers > 900) return 6
  if (totalLayers > 400) return 8
  return BATCH_SIZE
}

/**
 * Create a single layer (simplified version of createLayerFromJSON)
 */
function createSingleLayer(layerJSON, parent, parentFrame, depth) {
  var layerClass = layerJSON._class
  var frame = normalizeFrame(layerJSON.frame)
  
  // Clamp coordinates
  var MAX_COORD = 100000
  var MIN_COORD = -100000
  frame.x = Math.max(MIN_COORD, Math.min(MAX_COORD, frame.x || 0))
  frame.y = Math.max(MIN_COORD, Math.min(MAX_COORD, frame.y || 0))
  
  var layer = null
  
  try {
    // Check if this is an SVG group (marked by html2sketch)
    if (layerClass === 'group' && layerJSON.name === 'svg' && layerJSON._isSVGImport && layerJSON._svgString) {
      console.log('[AsyncBatch] Detected SVG import, attempting to import...')
      layer = importSVGLayer(layerJSON, parent, frame)
      if (layer) {
        return layer
      }
      // If SVG import failed, fall through to create as group
    }
    
    switch (layerClass) {
      case 'text':
        layer = createTextLayer(layerJSON, parent, frame)
        break
        
      case 'rectangle':
      case 'oval':
        layer = createShapeLayer(layerJSON, parent, frame)
        break
        
      case 'group':
      case 'artboard':
        layer = createGroupLayer(layerJSON, parent, frame)
        break
        
      case 'shapeGroup':
        layer = createShapeGroupLayer(layerJSON, parent, frame)
        break
        
      case 'shapePath':
        layer = createShapePathLayer(layerJSON, parent, frame)
        break
        
      default:
        // Unknown type, create as rectangle
        layer = createShapeLayer(layerJSON, parent, frame)
    }
  } catch (e) {
    console.error('[AsyncBatch] Error creating layer type', layerClass, ':', e.message)
  }
  
  return layer
}

/**
 * Import SVG as native Sketch layer
 */
function importSVGLayer(layerJSON, parent, frame) {
  try {
    var svgString = layerJSON._svgString
    if (!svgString || svgString.length > 512 * 1024) {
      console.log('[AsyncBatch] SVG too large or empty, skipping')
      return null
    }
    
    console.log('[AsyncBatch] Importing SVG, size:', svgString.length)
    
    // Create temporary file for SVG
    var tempPath = NSTemporaryDirectory() + 'temp_svg_' + Date.now() + '.svg'
    var svgData = NSString.stringWithString(svgString).dataUsingEncoding(NSUTF8StringEncoding)
    svgData.writeToFile_atomically(tempPath, true)
    
    // Import SVG using Sketch API
    var importedLayer = sketch.createLayerFromData(svgData, 'svg')
    
    if (importedLayer) {
      // Set parent and frame
      importedLayer.parent = parent
      importedLayer.frame.x = frame.x
      importedLayer.frame.y = frame.y
      
      // Scale to match target size if needed
      if (frame.width && frame.height) {
        var scaleX = frame.width / importedLayer.frame.width
        var scaleY = frame.height / importedLayer.frame.height
        var scale = Math.min(scaleX, scaleY)
        
        if (scale !== 1) {
          importedLayer.frame.width *= scale
          importedLayer.frame.height *= scale
        }
      }
      
      importedLayer.name = layerJSON.name || 'SVG'
      
      // CRITICAL: Remove any borders from SVG layers
      try {
        if (importedLayer.style) {
          importedLayer.style.borders = []
          console.log('[AsyncBatch] Removed borders from SVG layer')
        }
        
        // Also remove borders from all child layers if it's a group
        if (importedLayer.layers && importedLayer.layers.length > 0) {
          importedLayer.layers.forEach(function(child) {
            if (child.style) {
              child.style.borders = []
            }
          })
          console.log('[AsyncBatch] Removed borders from', importedLayer.layers.length, 'SVG child layers')
        }
      } catch (e) {
        console.log('[AsyncBatch] Failed to remove SVG borders:', e.message)
      }
      
      // Clean up temp file
      try {
        NSFileManager.defaultManager().removeItemAtPath_error(tempPath, null)
      } catch (e) {
        // Ignore cleanup errors
      }
      
      console.log('[AsyncBatch] SVG imported successfully')
      return importedLayer
    }
  } catch (e) {
    console.log('[AsyncBatch] SVG import failed:', e.message)
  }
  
  return null
}

/**
 * Create text layer
 */
function createTextLayer(layerJSON, parent, frame) {
  var textContent = 'Text'
  try {
    // Try to get text from attributedString
    if (layerJSON.attributedString && layerJSON.attributedString.string) {
      textContent = layerJSON.attributedString.string
    } 
    // Check for placeholder text (for input fields) - html2sketch stores this in name
    else if (layerJSON.name && layerJSON.name !== 'text' && layerJSON.name !== '') {
      textContent = layerJSON.name
    }
  } catch (e) {
    // Use default
  }
  
  var textLayer = new sketch.Text({
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
  
  // Apply text styling
  try {
    var textStyle = layerJSON.style?.textStyle?.encodedAttributes
    if (textStyle) {
      var fontSize = textStyle.MSAttributedStringFontAttribute?.attributes?.size
      if (fontSize && fontSize > 0 && fontSize < 200) {
        textLayer.style.fontSize = fontSize
      }
      
      var fontFamily = textStyle.MSAttributedStringFontAttribute?.attributes?.name
      if (fontFamily) {
        textLayer.style.fontFamily = fontFamily
      }
      
      var textColor = textStyle.MSAttributedStringColorAttribute
      if (textColor && textColor.red !== undefined) {
        var r = Math.round(textColor.red * 255)
        var g = Math.round(textColor.green * 255)
        var b = Math.round(textColor.blue * 255)
        var a = textColor.alpha !== undefined ? textColor.alpha : 1
        textLayer.style.textColor = `rgba(${r}, ${g}, ${b}, ${a})`
      }
      
      // Text alignment
      var paragraphStyle = textStyle.paragraphStyle
      if (paragraphStyle && paragraphStyle.alignment !== undefined) {
        var alignmentMap = ['left', 'right', 'center', 'justify']
        textLayer.style.alignment = alignmentMap[paragraphStyle.alignment] || 'left'
      }
    }
    
    // Apply opacity
    if (layerJSON.style?.contextSettings?.opacity !== undefined) {
      textLayer.style.opacity = layerJSON.style.contextSettings.opacity
    }
  } catch (e) {
    // Styling failed, continue with defaults
    console.log('[AsyncBatch] Text styling failed:', e.message)
  }
  
  return textLayer
}

/**
 * Create shape layer (rectangle/oval)
 */
function createShapeLayer(layerJSON, parent, frame) {
  // Extract corner radius BEFORE creating shape
  var cornerRadius = 0
  if (layerJSON._class === 'rectangle' && layerJSON.points && layerJSON.points.length >= 4) {
    layerJSON.points.forEach(function(pt) {
      if (pt.cornerRadius !== undefined && pt.cornerRadius > 0) {
        cornerRadius = Math.max(cornerRadius, pt.cornerRadius)
      }
    })
    if (cornerRadius > 0) {
      console.log('[AsyncBatch] *** FOUND corner radius:', cornerRadius, 'for', layerJSON.name)
    }
  }
  
  // Create shape with proper type
  var shape = new sketch.Shape({
    parent: parent,
    name: layerJSON.name || 'Shape',
    frame: {
      x: frame.x,
      y: frame.y,
      width: Math.max(1, frame.width),
      height: Math.max(1, frame.height)
    }
  })
  
  // CRITICAL: Apply corner radius IMMEDIATELY after shape creation, before other styles
  if (cornerRadius > 0 && layerJSON._class === 'rectangle') {
    try {
      console.log('[AsyncBatch] *** Applying corner radius immediately:', cornerRadius)
      
      // Access the underlying native object to set corner radius
      var nativeShape = shape.sketchObject
      if (nativeShape && nativeShape.layers && nativeShape.layers().count() > 0) {
        var path = nativeShape.layers().firstObject()
        if (path && path.setCornerRadius) {
          path.setCornerRadius(cornerRadius)
          console.log('[AsyncBatch] *** Corner radius applied via native API')
        }
      }
    } catch (e) {
      console.log('[AsyncBatch] *** Native corner radius failed:', e.message)
    }
  }
  
  // Build style from JSON directly (avoid aggressive filtering that loses fidelity)
  try {
    var shapeStyle = buildShapeStyle(layerJSON.style)
    applyShapeStyle(shape, shapeStyle)
    if (shapeStyle.opacity !== undefined) {
      shape.style.opacity = shapeStyle.opacity
    }
  } catch (e) {
    console.log('[AsyncBatch] Styling failed:', e.message)
    // Continue with basic shape
  }
  
  return shape
}

/**
 * Create group layer
 */
function createGroupLayer(layerJSON, parent, frame) {
  var group = new sketch.Group({
    parent: parent,
    name: layerJSON.name || 'Group',
    frame: {
      x: frame.x,
      y: frame.y,
      width: Math.max(1, frame.width),
      height: Math.max(1, frame.height)
    }
  })
  
  // Apply opacity if specified
  try {
    if (layerJSON.style?.contextSettings?.opacity !== undefined) {
      group.style.opacity = layerJSON.style.contextSettings.opacity
    }
  } catch (e) {
    // Opacity failed
  }
  
  return group
}

/**
 * Create shape group layer
 */
function createShapeGroupLayer(layerJSON, parent, frame) {
  var group = createGroupLayer(layerJSON, parent, frame)

  try {
    var shapeStyle = buildShapeStyle(layerJSON.style)
    // Store fills for child shapePath inheritance.
    if (shapeStyle.fills && shapeStyle.fills.length > 0) {
      group._shapeGroupFills = shapeStyle.fills
    }
    if (shapeStyle.opacity !== undefined) {
      group.style.opacity = shapeStyle.opacity
    }
  } catch (e) {
    console.log('[AsyncBatch] ShapeGroup style parse failed:', e.message)
  }

  return group
}

/**
 * Create shape path layer (simplified as rectangle)
 */
function createShapePathLayer(layerJSON, parent, frame) {
  var shapeStyle = buildShapeStyle(layerJSON.style)
  if ((!shapeStyle.fills || shapeStyle.fills.length === 0) && parent && parent._shapeGroupFills) {
    shapeStyle.fills = parent._shapeGroupFills
  }

  // Sketch JS API has limited cross-version support for raw vector points.
  // Keep batch conversion stable by using Shape with inherited fills/borders.
  var shape = new sketch.Shape({
    parent: parent,
    name: layerJSON.name || 'ShapePath',
    frame: {
      x: frame.x,
      y: frame.y,
      width: Math.max(1, frame.width),
      height: Math.max(1, frame.height)
    }
  })

  applyShapeStyle(shape, shapeStyle)
  if (shapeStyle.opacity !== undefined) {
    shape.style.opacity = shapeStyle.opacity
  }

  return shape
}

function normalizeFrame(frame) {
  var source = frame || {}
  var width = source.width
  var height = source.height
  if (width === undefined || width === null || width <= 0) width = 1
  if (height === undefined || height === null || height <= 0) height = 1

  return {
    x: source.x || 0,
    y: source.y || 0,
    width: width,
    height: height
  }
}

function sketchColorToRgba(color) {
  if (!color) return null
  if (typeof color === 'string') return color
  if (color.red === undefined) return null
  var r = Math.round(color.red * 255)
  var g = Math.round(color.green * 255)
  var b = Math.round(color.blue * 255)
  var a = color.alpha !== undefined ? color.alpha : 1
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')'
}

function mapGradientType(gradientType) {
  if (gradientType === 1) return 'Radial'
  if (gradientType === 2) return 'Angular'
  return 'Linear'
}

function buildShapeStyle(style) {
  var result = {}
  if (!style) return result

  if (style.fills && style.fills.length > 0) {
    var fills = []
    style.fills.forEach(function(fillData) {
      if (!fillData || fillData.isEnabled === false) return
      if (fillData.fillType === 1 && fillData.gradient) {
        var gradientStops = []
        if (fillData.gradient.stops && fillData.gradient.stops.length > 0) {
          fillData.gradient.stops.forEach(function(stop) {
            var stopColor = sketchColorToRgba(stop.color)
            if (stopColor) {
              gradientStops.push({
                color: stopColor,
                position: stop.position !== undefined ? stop.position : 0
              })
            }
          })
        }
        if (gradientStops.length > 0) {
          fills.push({
            fillType: 'Gradient',
            gradient: {
              gradientType: mapGradientType(fillData.gradient.gradientType),
              from: fillData.gradient.from || { x: 0.5, y: 0 },
              to: fillData.gradient.to || { x: 0.5, y: 1 },
              stops: gradientStops
            }
          })
        }
        return
      }
      var fillColor = sketchColorToRgba(fillData.color)
      if (fillColor) {
        fills.push({ fillType: 'Color', color: fillColor })
      }
    })
    if (fills.length > 0) result.fills = fills
  }

  if (style.borders && style.borders.length > 0) {
    var borders = []
    style.borders.forEach(function(borderData) {
      if (!borderData || borderData.isEnabled === false) return
      var borderColor = sketchColorToRgba(borderData.color)
      if (!borderColor) return
      var thickness = borderData.thickness
      if (thickness === undefined || thickness <= 0) return
      borders.push({
        thickness: thickness,
        position: borderData.position === 0 ? 'Center' : (borderData.position === 1 ? 'Inside' : 'Outside'),
        color: borderColor
      })
    })
    if (borders.length > 0) result.borders = borders
  }

  if (style.shadows && style.shadows.length > 0) {
    var shadows = []
    style.shadows.forEach(function(shadowData) {
      if (!shadowData || shadowData.isEnabled === false) return
      var shadowColor = sketchColorToRgba(shadowData.color)
      if (!shadowColor) return
      shadows.push({
        x: shadowData.offsetX || 0,
        y: shadowData.offsetY || 0,
        blur: shadowData.blurRadius || 0,
        spread: shadowData.spread || 0,
        color: shadowColor
      })
    })
    if (shadows.length > 0) result.shadows = shadows
  }

  if (style.innerShadows && style.innerShadows.length > 0) {
    var innerShadows = []
    style.innerShadows.forEach(function(shadowData) {
      if (!shadowData || shadowData.isEnabled === false) return
      var innerShadowColor = sketchColorToRgba(shadowData.color)
      if (!innerShadowColor) return
      innerShadows.push({
        x: shadowData.offsetX || 0,
        y: shadowData.offsetY || 0,
        blur: shadowData.blurRadius || 0,
        spread: shadowData.spread || 0,
        color: innerShadowColor
      })
    })
    if (innerShadows.length > 0) result.innerShadows = innerShadows
  }

  if (style.blur && style.blur.isEnabled !== false) {
    result.blur = {
      blurType: style.blur.type === 0 ? 'Gaussian' : 'Motion',
      radius: style.blur.radius || 4,
      motionAngle: style.blur.motionAngle || 0,
      center: style.blur.center || { x: 0.5, y: 0.5 },
      saturation: style.blur.saturation || 1
    }
  }

  if (style.contextSettings && style.contextSettings.opacity !== undefined) {
    result.opacity = style.contextSettings.opacity
  }

  return result
}

function applyShapeStyle(shape, style) {
  if (!shape || !style) return
  if (style.fills) shape.style.fills = style.fills
  if (style.borders) shape.style.borders = style.borders
  if (style.shadows) shape.style.shadows = style.shadows
  if (style.innerShadows) shape.style.innerShadows = style.innerShadows
  if (style.blur) shape.style.blur = style.blur
}
