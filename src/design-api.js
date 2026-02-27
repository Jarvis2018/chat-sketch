import sketch from 'sketch'

// Global limits for preventing crashes on complex HTML
const MAX_DEPTH = 30 // 降低最大深度，防止栈溢出
const MAX_LAYERS = 500 // 降低最大层数，防止内存溢出
const MAX_JSON_SIZE = 5 * 1024 * 1024 // 5MB - 降低 JSON 大小限制
const CHILDREN_BATCH_SIZE = 20 // 降低批处理大小，减少单次处理压力
const MAX_SVG_SIZE = 512 * 1024 // 512KB - SVG 大小限制

// Module-level layer counter (reset at start of each conversion)
var globalLayerCount = 0
var skippedLayerCount = 0

/**
 * Generate a UUID for Sketch objects
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0
    var v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Recursively find MSShapePathLayer within a group hierarchy
 * @param {Object} layer - Native Sketch layer object
 * @returns {Object|null} - MSShapePathLayer if found, null otherwise
 */
function findShapePathLayer(layer) {
  if (!layer) return null

  // Check if this is the layer we're looking for
  if (layer.class() === 'MSShapePathLayer') {
    return layer
  }

  // If it's a group, search recursively
  if (layer.class() === 'MSShapeGroup' && layer.layers()) {
    var layers = layer.layers()
    var count = layers.count()
    for (var i = 0; i < count; i++) {
      var child = layers.objectAtIndex(i)
      var result = findShapePathLayer(child)
      if (result) return result
    }
  }

  return null
}

/**
 * Convert html2sketch points data to SVG path string
 * @param {Array} points - Array of point objects with point, curveFrom, curveTo, curveMode
 * @param {number} width - Width for denormalization
 * @param {number} height - Height for denormalization
 * @param {boolean} isClosed - Whether the path is closed
 * @returns {string} - SVG path string
 */
function convertPointsToSVGPath(points, width, height, isClosed) {
  if (!points || points.length === 0) return ''

  var pathCommands = []

  for (var i = 0; i < points.length; i++) {
    var pt = points[i]

    // Parse main point coordinates (normalized 0-1, need to denormalize)
    var pointX = 0, pointY = 0
    if (typeof pt.point === 'string') {
      var match = pt.point.match(/\{(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\}/)
      if (match) {
        pointX = parseFloat(match[1]) * width
        pointY = parseFloat(match[2]) * height
      }
    } else if (pt.point && typeof pt.point === 'object') {
      pointX = (pt.point.x || 0) * width
      pointY = (pt.point.y || 0) * height
    }

    // Parse curveFrom (control point for curve entering this point)
    var curveFromX = pointX, curveFromY = pointY
    if (typeof pt.curveFrom === 'string') {
      var match = pt.curveFrom.match(/\{(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\}/)
      if (match) {
        curveFromX = parseFloat(match[1]) * width
        curveFromY = parseFloat(match[2]) * height
      }
    } else if (pt.curveFrom && typeof pt.curveFrom === 'object') {
      curveFromX = (pt.curveFrom.x || 0) * width
      curveFromY = (pt.curveFrom.y || 0) * height
    }

    // Parse curveTo (control point for curve leaving this point)
    var curveToX = pointX, curveToY = pointY
    if (typeof pt.curveTo === 'string') {
      var match = pt.curveTo.match(/\{(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\}/)
      if (match) {
        curveToX = parseFloat(match[1]) * width
        curveToY = parseFloat(match[2]) * height
      }
    } else if (pt.curveTo && typeof pt.curveTo === 'object') {
      curveToX = (pt.curveTo.x || 0) * width
      curveToY = (pt.curveTo.y || 0) * height
    }

    var curveMode = pt.curveMode || 1

    if (i === 0) {
      // First point - move to
      pathCommands.push('M ' + pointX.toFixed(4) + ' ' + pointY.toFixed(4))
    } else {
      // Get previous point's curveTo for bezier control
      var prevPt = points[i - 1]
      var prevCurveToX = pointX, prevCurveToY = pointY

      if (typeof prevPt.curveTo === 'string') {
        var match = prevPt.curveTo.match(/\{(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\}/)
        if (match) {
          prevCurveToX = parseFloat(match[1]) * width
          prevCurveToY = parseFloat(match[2]) * height
        }
      } else if (prevPt.curveTo && typeof prevPt.curveTo === 'object') {
        prevCurveToX = (prevPt.curveTo.x || 0) * width
        prevCurveToY = (prevPt.curveTo.y || 0) * height
      }

      if (curveMode === 1) {
        // Straight line
        pathCommands.push('L ' + pointX.toFixed(4) + ' ' + pointY.toFixed(4))
      } else {
        // Curved - cubic bezier: C cp1x cp1y, cp2x cp2y, x y
        // cp1 is previous point's curveTo
        // cp2 is current point's curveFrom
        pathCommands.push('C ' + prevCurveToX.toFixed(4) + ' ' + prevCurveToY.toFixed(4) +
                         ', ' + curveFromX.toFixed(4) + ' ' + curveFromY.toFixed(4) +
                         ', ' + pointX.toFixed(4) + ' ' + pointY.toFixed(4))
      }
    }
  }

  // Close path if needed
  if (isClosed !== false) {
    pathCommands.push('Z')
  }

  return pathCommands.join(' ')
}

/**
 * Create a shape from SVG path string using NSBezierPath
 * @param {string} svgPath - SVG path string
 * @param {Object} frame - Frame with x, y, width, height
 * @param {Object} style - Style object with fills, borders, opacity
 * @returns {Object} - Native MSShapeGroup containing the shape path
 */
function createShapeFromSVGPath(svgPath, frame, style) {
  console.log('[createShapeFromSVGPath] Creating shape from SVG path')

  try {
    // svgPath is a JavaScript string, convert to NSString if needed
    var svgPathString = String(svgPath)
    
    // Use NSBezierPath to parse SVG path - manually parse since parseSVGPath may not be available
    var bezierPath = parseSVGPathManually(svgPathString)

    if (!bezierPath) {
      throw new Error('Failed to create bezier path from SVG')
    }

    // Create shape group
    var shapeGroup = MSShapeGroup.alloc().init()
    shapeGroup.setName('ShapePath')

    // Set frame
    var rect = CGRectMake(frame.x || 0, frame.y || 0, frame.width || 100, frame.height || 100)
    shapeGroup.setFrame(rect)

    // Create shape path layer
    var shapePathLayer = MSShapePathLayer.alloc().init()
    shapePathLayer.setName('Path')

    // Create MSPath from bezier path
    var msPath = MSPath.pathWithBezierPath(bezierPath)
    shapePathLayer.setPath(msPath)

    // Add path layer to shape group
    shapeGroup.addLayer(shapePathLayer)

    // Apply style
    applyStyleToNativeShape(shapeGroup, style)

    return shapeGroup
  } catch (e) {
    console.log('[createShapeFromSVGPath] Error:', e)
    throw e
  }
}

/**
 * Manually parse SVG path string to NSBezierPath
 * Handles M, L, C, Z commands
 * @param {string} svgPath - SVG path string
 * @returns {Object} - NSBezierPath
 */
function parseSVGPathManually(svgPath) {
  var path = NSBezierPath.bezierPath()

  // Tokenize the path string
  var tokens = svgPath.match(/[MLCZmlcz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g)
  if (!tokens) return path

  var i = 0
  var currentX = 0, currentY = 0
  var startX = 0, startY = 0

  while (i < tokens.length) {
    var cmd = tokens[i]

    if (cmd === 'M' || cmd === 'm') {
      // Move to
      i++
      var x = parseFloat(tokens[i++])
      var y = parseFloat(tokens[i++])
      if (cmd === 'm') {
        x += currentX
        y += currentY
      }
      path.moveToPoint(NSMakePoint(x, y))
      currentX = x
      currentY = y
      startX = x
      startY = y
    } else if (cmd === 'L' || cmd === 'l') {
      // Line to
      i++
      var x = parseFloat(tokens[i++])
      var y = parseFloat(tokens[i++])
      if (cmd === 'l') {
        x += currentX
        y += currentY
      }
      path.lineToPoint(NSMakePoint(x, y))
      currentX = x
      currentY = y
    } else if (cmd === 'C' || cmd === 'c') {
      // Cubic bezier
      i++
      var cp1x = parseFloat(tokens[i++])
      var cp1y = parseFloat(tokens[i++])
      var cp2x = parseFloat(tokens[i++])
      var cp2y = parseFloat(tokens[i++])
      var x = parseFloat(tokens[i++])
      var y = parseFloat(tokens[i++])
      if (cmd === 'c') {
        cp1x += currentX
        cp1y += currentY
        cp2x += currentX
        cp2y += currentY
        x += currentX
        y += currentY
      }
      path.curveToPoint_controlPoint1_controlPoint2_(
        NSMakePoint(x, y),
        NSMakePoint(cp1x, cp1y),
        NSMakePoint(cp2x, cp2y)
      )
      currentX = x
      currentY = y
    } else if (cmd === 'Z' || cmd === 'z') {
      // Close path
      path.closePath()
      currentX = startX
      currentY = startY
      i++
    } else {
      // Unknown command, skip
      i++
    }
  }

  return path
}

/**
 * Create a shape path layer using native Sketch API via SVG path string
 * This properly handles SVG path data with bezier curves
 * @param {Array} points - Array of point objects with point, curveFrom, curveTo, curveMode
 * @param {Object} frame - Frame with x, y, width, height
 * @param {boolean} isClosed - Whether the path is closed
 * @param {Object} style - Style object with fills, borders, opacity
 * @returns {Object} - Native MSShapeGroup containing the shape path
 */
function createNativeShapePathLayer(points, frame, isClosed, style) {
  console.log('[createNativeShapePathLayer] Creating with', points.length, 'points')

  // Convert points to SVG path string
  var svgPath = convertPointsToSVGPath(points, frame.width || 100, frame.height || 100, isClosed)
  console.log('[createNativeShapePathLayer] Generated SVG path:', svgPath.substring(0, 100) + '...')

  // Create shape from SVG path
  return createShapeFromSVGPath(svgPath, frame, style)
}

/**
 * Apply style to a native shape layer
 * @param {Object} nativeLayer - Native MSShapeGroup
 * @param {Object} style - Style object with fills, borders, opacity
 */
function applyStyleToNativeShape(nativeLayer, style) {
  if (!nativeLayer || !style) return

  // Get or create style - for MSShapeGroup, the style is on the group itself
  var nativeStyle = nativeLayer.style()
  if (!nativeStyle) {
    nativeStyle = MSStyle.alloc().init()
    nativeLayer.setStyle(nativeStyle)
  }

  console.log('[applyStyleToNativeShape] Applying style to shape group')

  // Apply fills
  if (style.fills && style.fills.length > 0) {
    var fills = NSMutableArray.alloc().init()

    for (var i = 0; i < style.fills.length; i++) {
      var fillData = style.fills[i]
      var fill = MSStyleFill.alloc().init()

      // Validate fillType: 0=Color, 1=Gradient, 2=Pattern, 3=Noise
      var fillType = fillData.fillType || 0
      if (fillType < 0 || fillType > 3) fillType = 0
      fill.setFillType(fillType)
      fill.setIsEnabled(true)

      if (fillType === 1 && fillData.gradient) {
        // Gradient fill
        var gradient = MSGradient.alloc().init()

        // Validate gradientType: 0=Linear, 1=Radial, 2=Angular
        var gradientType = fillData.gradient.gradientType || 0
        if (gradientType < 0 || gradientType > 2) gradientType = 0
        gradient.setGradientType(gradientType)

        // Set from/to points
        var from = CGPointMake(
          fillData.gradient.from?.x || 0.5,
          fillData.gradient.from?.y || 0
        )
        var to = CGPointMake(
          fillData.gradient.to?.x || 0.5,
          fillData.gradient.to?.y || 1
        )
        gradient.setFrom(from)
        gradient.setTo(to)

        // Set stops
        if (fillData.gradient.stops && fillData.gradient.stops.length > 0) {
          var stops = NSMutableArray.alloc().init()
          for (var j = 0; j < fillData.gradient.stops.length; j++) {
            var stopData = fillData.gradient.stops[j]
            var stop = MSGradientStop.alloc().init()

            // Parse color
            var colorStr = stopData.color
            if (colorStr && colorStr.startsWith('rgba')) {
              var match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
              if (match) {
                var r = parseInt(match[1]) / 255
                var g = parseInt(match[2]) / 255
                var b = parseInt(match[3]) / 255
                var a = match[4] !== undefined ? parseFloat(match[4]) : 1
                var color = MSColor.colorWithRed_green_blue_alpha_(r, g, b, a)
                stop.setColor(color)
              }
            }

            stop.setPosition(stopData.position || 0)
            stops.addObject(stop)
          }
          gradient.setStops(stops)
        }

        fill.setGradient(gradient)
      } else {
        // Solid color fill
        var colorStr = fillData.color || 'rgba(0,0,0,1)'
        var match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
        if (match) {
          var r = parseInt(match[1]) / 255
          var g = parseInt(match[2]) / 255
          var b = parseInt(match[3]) / 255
          var a = match[4] !== undefined ? parseFloat(match[4]) : 1
          var color = MSColor.colorWithRed_green_blue_alpha_(r, g, b, a)
          fill.setColor(color)
        }
      }

      fills.addObject(fill)
    }

    nativeStyle.setFills(fills)
  }

  // Apply borders
  if (style.borders && style.borders.length > 0) {
    var borders = NSMutableArray.alloc().init()

    for (var i = 0; i < style.borders.length; i++) {
      var borderData = style.borders[i]
      var border = MSStyleBorder.alloc().init()

      // Validate fillType: 0=Color, 1=Gradient, 2=Pattern, 3=Noise
      var borderFillType = borderData.fillType || 0
      if (borderFillType < 0 || borderFillType > 3) borderFillType = 0
      border.setFillType(borderFillType)

      border.setThickness(borderData.thickness || 1)

      // Validate position: 0=Center, 1=Inside, 2=Outside, 3=Fill, 4=Inner
      var position = borderData.position || 1
      if (position < 0 || position > 4) position = 1
      border.setPosition(position)

      border.setIsEnabled(true)

      var colorStr = borderData.color || 'rgba(0,0,0,1)'
      var match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (match) {
        var r = parseInt(match[1]) / 255
        var g = parseInt(match[2]) / 255
        var b = parseInt(match[3]) / 255
        var a = match[4] !== undefined ? parseFloat(match[4]) : 1
        var color = MSColor.colorWithRed_green_blue_alpha_(r, g, b, a)
        border.setColor(color)
      }

      borders.addObject(border)
    }

    nativeStyle.setBorders(borders)
  }

  // Apply opacity via context settings
  if (style.opacity !== undefined) {
    var contextSettings = nativeStyle.contextSettings()
    if (!contextSettings) {
      contextSettings = MSGraphicsContextSettings.alloc().init()
      nativeStyle.setContextSettings(contextSettings)
    }
    contextSettings.setOpacity(style.opacity)
  }

  // Validate and set blendMode if provided
  // blendMode: 0=Normal, 1=Darken, 2=Multiply, 3=ColorBurn, 4=Lighten, 5=Screen, 6=ColorDodge, 7=Overlay, 8=SoftLight, 9=HardLight, 10=Difference, 11=Exclusion, 12=Hue, 13=Saturation, 14=Color, 15=Luminosity
  if (style.blendMode !== undefined) {
    var blendMode = style.blendMode
    if (blendMode < 0 || blendMode > 15) blendMode = 0
    var cs = nativeStyle.contextSettings()
    if (!cs) {
      cs = MSGraphicsContextSettings.alloc().init()
      nativeStyle.setContextSettings(cs)
    }
    cs.setBlendMode(blendMode)
  }
}

/**
 * Helper function to convert Sketch JSON color to rgba string
 * Supports Sketch format {red, green, blue, alpha} (0-1 range),
 * HEX strings (#RGB, #RRGGBB, #AARRGGBB), and rgb/rgba strings
 */
function sketchColorToRgba(color) {
  if (!color) return null

  // 处理 Sketch 格式对象 {red, green, blue, alpha} (值范围 0-1)
  if (color.red !== undefined) {
    var r = Math.round(color.red * 255)
    var g = Math.round(color.green * 255)
    var b = Math.round(color.blue * 255)
    var a = color.alpha !== undefined ? color.alpha : 1
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  // 处理 HEX 颜色字符串 (#RGB, #RRGGBB, #AARRGGBB)
  if (typeof color === 'string') {
    var hex = color.trim()

    // 简化 3 位 HEX 为 6 位
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    }

    // 解析 #RRGGBB
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, 1)`
    }

    // 解析 #RRGGBBAA
    result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${parseInt(result[4], 16) / 255})`
    }

    // 处理 rgb/rgba 格式
    var rgbaMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
    if (rgbaMatch) {
      return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${rgbaMatch[4] || 1})`
    }
  }

  return null
}

/**
 * Helper function to parse rgba string to color object
 * Converts "rgba(r, g, b, a)" to {r, g, b, a} object with values 0-255
 */
function parseColorValue(rgbaString) {
  if (!rgbaString || typeof rgbaString !== 'string') {
    return { r: 0, g: 0, b: 0, a: 1 }
  }
  var match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

/**
 * Create Sketch layer from html2sketch JSON recursively
 * This replaces the internal MSJSONDictionaryUnarchiver approach
 * @param {Object} layerJSON - The layer JSON from html2sketch
 * @param {Object} parent - Parent layer
 * @param {Object} parentFrame - Parent frame for coordinate calculation
 * @param {number} depth - Current recursion depth (default: 0)
 * @returns {Object|null} - Created layer or null if skipped
 */
function createLayerFromJSON(layerJSON, parent, parentFrame, depth) {
  // Initialize depth if not provided
  if (depth === undefined) {
    depth = 0
  }

  // Check recursion depth limit
  if (depth > MAX_DEPTH) {
    console.warn('[createLayerFromJSON] Max depth ' + MAX_DEPTH + ' exceeded, skipping layer')
    return null
  }

  // Check global layer count limit
  if (globalLayerCount >= MAX_LAYERS) {
    skippedLayerCount++
    if (skippedLayerCount % 50 === 1) {
      console.warn('[createLayerFromJSON] Max layers ' + MAX_LAYERS + ' reached, skipped ' + skippedLayerCount + ' layers')
    }
    return null
  }
  globalLayerCount++

  // Validate layerJSON
  if (!layerJSON || typeof layerJSON !== 'object') {
    console.error('[createLayerFromJSON] Invalid layerJSON:', layerJSON)
    return null
  }

  var layerClass = layerJSON._class
  if (!layerClass) {
    console.error('[createLayerFromJSON] Missing _class in layerJSON')
    return null
  }

  var frame = layerJSON.frame || { x: 0, y: 0, width: 100, height: 100 }

  // Ensure frame has valid dimensions (minimum 1x1 to prevent crashes)
  frame.width = Math.max(1, frame.width || 100)
  frame.height = Math.max(1, frame.height || 100)
  
  // Validate and clamp coordinates to prevent out-of-bounds rendering issues
  // Extremely large or negative coordinates can cause Sketch to crash
  var MAX_COORD = 100000
  var MIN_COORD = -100000
  if (frame.x < MIN_COORD || frame.x > MAX_COORD) {
    console.warn('[createLayerFromJSON] Clamping invalid x coordinate:', frame.x, '→', Math.max(MIN_COORD, Math.min(MAX_COORD, frame.x)))
    frame.x = Math.max(MIN_COORD, Math.min(MAX_COORD, frame.x))
  }
  if (frame.y < MIN_COORD || frame.y > MAX_COORD) {
    console.warn('[createLayerFromJSON] Clamping invalid y coordinate:', frame.y, '→', Math.max(MIN_COORD, Math.min(MAX_COORD, frame.y)))
    frame.y = Math.max(MIN_COORD, Math.min(MAX_COORD, frame.y))
  }
  
  // Clamp dimensions to reasonable values
  var MAX_DIMENSION = 100000
  if (frame.width > MAX_DIMENSION) {
    console.warn('[createLayerFromJSON] Clamping width:', frame.width, '→', MAX_DIMENSION)
    frame.width = MAX_DIMENSION
  }
  if (frame.height > MAX_DIMENSION) {
    console.warn('[createLayerFromJSON] Clamping height:', frame.height, '→', MAX_DIMENSION)
    frame.height = MAX_DIMENSION
  }

  var layer = null
  var style = layerJSON.style || {}

  // html2sketch 输出中，Group/ShapeGroup 的子元素坐标已经是相对的
  // 只有直接添加到 page 的元素才需要绝对坐标
  var useAbsoluteFrame = !parentFrame
  var absoluteFrame = {
    x: useAbsoluteFrame ? (frame.x || 0) : (frame.x || 0),
    y: useAbsoluteFrame ? (frame.y || 0) : (frame.y || 0),
    width: frame.width || 100,
    height: frame.height || 100
  }

  // Detailed logging for debugging group/icon structures
  console.log('[createLayerFromJSON] Creating layer:', layerClass, layerJSON.name)
  console.log('[createLayerFromJSON] Local frame:', JSON.stringify(frame))
  console.log('[createLayerFromJSON] Absolute frame:', JSON.stringify(absoluteFrame))
  console.log('[createLayerFromJSON] Style:', JSON.stringify(style))

  // Log child layers info for groups and shapeGroups
  if (layerJSON.layers) {
    console.log('[createLayerFromJSON] Child layers count:', layerJSON.layers.length)
    layerJSON.layers.forEach(function(child, idx) {
      console.log('[createLayerFromJSON]   Child[' + idx + ']:', child._class, child.name)
    })
  }

  // Log path info for shapePath types
  if (layerClass === 'shapePath' && layerJSON.path) {
    console.log('[createLayerFromJSON] ShapePath points:', JSON.stringify(layerJSON.path.points))
  }

  switch (layerClass) {
    case 'artboard':
      // CRITICAL FIX: Use Group instead of Artboard to avoid crashes
      // Artboards with complex children cause Sketch to crash when attached to Page
      // Groups work reliably and provide the same visual grouping
      console.log('[createLayerFromJSON] Creating Group instead of Artboard to prevent crashes')
      
      layer = new sketch.Group({
        parent: parent,
        name: layerJSON.name || 'Artboard',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 375,
          height: frame.height || 812
        }
      })
      
      // Set background using a rectangle layer if background color is provided
      if (layerJSON.backgroundColor) {
        var bg = layerJSON.backgroundColor
        var bgColor = bg.value || '#FFFFFF'
        console.log('[createLayerFromJSON] Adding background rectangle with color:', bgColor)
        
        try {
          var bgRect = new sketch.Shape({
            parent: layer,
            name: 'Background',
            frame: {
              x: 0,
              y: 0,
              width: frame.width || 375,
              height: frame.height || 812
            },
            style: {
              fills: [{
                color: bgColor,
                fillType: 0
              }]
            }
          })
          // Move background to bottom of layer stack
          bgRect.index = 0
        } catch (bgError) {
          console.log('[createLayerFromJSON] Error creating background:', bgError)
        }
      }
      break

    case 'group':
      // TEMPORARILY DISABLED: SVG import may cause crashes
      // Check if this is an SVG group marked for import
      if (false && layerJSON._isSVGImport && layerJSON._svgString) {
        console.log('[createLayerFromJSON] SVG import DISABLED to prevent crashes')
        // Fall through to normal group handling
      }
      
      // Normal group handling
      layer = new sketch.Group({
        parent: parent,
        name: layerJSON.name || 'Group',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 100,
          height: frame.height || 100
        }
      })
      // Apply opacity to group if specified
      if (style.contextSettings?.opacity !== undefined) {
        layer.style.opacity = style.contextSettings.opacity
      }
      // Group children are processed at the end with relative frames
      break

    case 'text':
      try {
        var textStyle = style.textStyle?.encodedAttributes || {}
        var fontSize = textStyle.MSAttributedStringFontAttribute?.attributes?.size || 16
        var fontFamily = textStyle.MSAttributedStringFontAttribute?.attributes?.name || 'PingFang SC'

        var textContent = ''
        try {
          textContent = layerJSON.attributedString?.string || ''
        } catch (e) {
          console.log('[createLayerFromJSON] Error getting text content:', e)
        }
        
        // Skip text layers with invalid coordinates (outside reasonable bounds)
        // These can cause Sketch to crash during rendering
        if (parentFrame && (absoluteFrame.x < -1000 || absoluteFrame.x > parentFrame.width + 1000)) {
          console.warn('[createLayerFromJSON] Skipping text layer with out-of-bounds x coordinate:', layerJSON.name, absoluteFrame.x)
          return null
        }

        layer = new sketch.Text({
          parent: parent,
          name: layerJSON.name || 'Text',
          text: textContent,
          frame: {
            x: absoluteFrame.x,
            y: absoluteFrame.y,
            width: Math.max(1, frame.width || 200),
            height: Math.max(1, frame.height || fontSize)
          }
        })

        // Apply text styling with error handling
        try {
          layer.style.fontSize = fontSize
        } catch (e) { console.log('[createLayerFromJSON] Error setting fontSize:', e) }

        try {
          layer.style.fontFamily = fontFamily
        } catch (e) { console.log('[createLayerFromJSON] Error setting fontFamily:', e) }

        // Text color
        var textColor = textStyle.MSAttributedStringColorAttribute
        if (textColor && textColor.red !== undefined) {
          // Convert to rgba string for Sketch API
          var r = Math.round(textColor.red * 255)
          var g = Math.round(textColor.green * 255)
          var b = Math.round(textColor.blue * 255)
          var a = textColor.alpha !== undefined ? textColor.alpha : 1
          try {
            layer.style.textColor = `rgba(${r}, ${g}, ${b}, ${a})`
          } catch (e) { console.log('[createLayerFromJSON] Error setting textColor:', e) }
        }

        // Text alignment
        var paragraphStyle = textStyle.paragraphStyle
        if (paragraphStyle?.alignment !== undefined) {
          // 0 = left, 1 = right, 2 = center, 3 = justified
          var alignmentMap = ['left', 'right', 'center', 'justify']
          try {
            layer.style.alignment = alignmentMap[paragraphStyle.alignment] || 'left'
          } catch (e) { console.log('[createLayerFromJSON] Error setting alignment:', e) }
        }

        // Text opacity
        if (style.contextSettings?.opacity !== undefined) {
          try {
            layer.style.opacity = style.contextSettings.opacity
          } catch (e) { console.log('[createLayerFromJSON] Error setting opacity:', e) }
        }
      } catch (textError) {
        console.error('[createLayerFromJSON] Error creating text layer:', textError)
        // Create a fallback text layer
        try {
          layer = new sketch.Text({
            parent: parent,
            name: layerJSON.name || 'Text (Error)',
            text: 'Error',
            frame: {
              x: absoluteFrame.x,
              y: absoluteFrame.y,
              width: 100,
              height: 16
            }
          })
        } catch (fallbackError) {
          console.error('[createLayerFromJSON] Fallback text creation failed:', fallbackError)
        }
      }
      break

    case 'shapeGroup':
      // ShapeGroup is a container with child shapes - create as Group and process children
      console.log('[createLayerFromJSON] Processing shapeGroup as container:', layerJSON.name)

      // Check if shapeGroup has fills that need to be propagated to child elements
      var shapeGroupFills = []
      if (style.fills && style.fills.length > 0) {
        var sgFill = style.fills[0]
        if (sgFill.isEnabled !== false && sgFill.fillType === 0 && sgFill.color) {
          var fillColor = sketchColorToRgba(sgFill.color)
          if (fillColor) {
            shapeGroupFills = [{ color: fillColor, fillType: 0 }]
            console.log('[createLayerFromJSON] ShapeGroup has fills to propagate:', fillColor)
          }
        }
      }

      layer = new sketch.Group({
        parent: parent,
        name: layerJSON.name || 'ShapeGroup',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 100,
          height: frame.height || 100
        }
      })

      // Store shapeGroup's fills on the layer object for child elements to inherit
      if (shapeGroupFills.length > 0) {
        layer._shapeGroupFills = shapeGroupFills
      }

      // Apply group-level opacity if specified
      if (style.contextSettings?.opacity !== undefined) {
        layer.style.opacity = style.contextSettings.opacity
      }
      // Children will be processed at the end with relative frames
      break

    case 'shapePath':
      // SVG paths from html2sketch - create using native MSShapePathLayer API
      console.log('[createLayerFromJSON] Processing shapePath:', layerJSON.name)

      var shapePathStyle = { fills: [], borders: [] }

      // First, check if parent shapeGroup has fills that need to be inherited
      if (parent._shapeGroupFills && parent._shapeGroupFills.length > 0) {
        shapePathStyle.fills = parent._shapeGroupFills
        console.log('[createLayerFromJSON] ShapePath inheriting fills from shapeGroup:', shapePathStyle.fills)
      }

      // Then parse shapePath's own style (will override inherited fills if present)
      if (style.fills && style.fills.length > 0) {
        var spFill = style.fills[0]
        if (spFill.isEnabled !== false && spFill.fillType === 0 && spFill.color) {
          var spFillColor = sketchColorToRgba(spFill.color)
          console.log('[createLayerFromJSON] ShapePath own fill color:', spFillColor)
          if (spFillColor) {
            shapePathStyle.fills = [{ color: spFillColor, fillType: 0 }]
          }
        } else if (spFill.fillType === 1 && spFill.gradient) {
          // Gradient fill
          var gradientStops = spFill.gradient.stops.map(function(stop) {
            return {
              color: sketchColorToRgba(stop.color),
              position: stop.position !== undefined ? stop.position : 0.5
            }
          })

          var parseGradientPoint = function(pointStr) {
            if (typeof pointStr === 'object' && pointStr.x !== undefined) {
              return pointStr
            }
            var match = pointStr.match(/\{(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\}/)
            if (match) {
              return { x: parseFloat(match[1]), y: parseFloat(match[2]) }
            }
            return { x: 0.5, y: 0 }
          }

          shapePathStyle.fills = [{
            fillType: 1,
            gradient: {
              from: parseGradientPoint(spFill.gradient.from || '{0.5, 0}'),
              to: parseGradientPoint(spFill.gradient.to || '{0.5, 1}'),
              stops: gradientStops,
              // Validate gradientType: 0=Linear, 1=Radial, 2=Angular
              gradientType: spFill.gradient.gradientType !== undefined ? Math.max(0, Math.min(2, spFill.gradient.gradientType)) : 0
            }
          }]
        }
      }

      // Special handling for icons drawn entirely with innerShadows
      if (shapePathStyle.fills.length === 0 && style.borders && style.borders.length === 0 &&
          style.innerShadows && style.innerShadows.length >= 2) {
        shapePathStyle.fills = [{ color: 'rgba(0,0,0,0.01)', fillType: 0 }]
        console.log('[createLayerFromJSON] Added transparent fill for innerShadow icon')
      }

      // Parse borders - only if thickness > 0
      if (style.borders && style.borders.length > 0) {
        var spBorder = style.borders[0]
        if (spBorder.isEnabled !== false && spBorder.fillType === 0 && spBorder.color && (spBorder.thickness || 0) > 0) {
          var spBorderColor = sketchColorToRgba(spBorder.color)
          if (spBorderColor) {
            shapePathStyle.borders = [{
              color: spBorderColor,
              fillType: 0,
              thickness: spBorder.thickness || 1,
              // Validate position: 0=Center, 1=Inside, 2=Outside
              position: spBorder.position !== undefined ? Math.max(0, Math.min(2, spBorder.position)) : 1
            }]
          }
        }
      }

      // Parse opacity
      if (style.contextSettings?.opacity !== undefined) {
        shapePathStyle.opacity = style.contextSettings.opacity
      }

      // Check if shapePath has custom path data (points)
      var points = null
      var isClosed = false

      if (layerJSON.path && layerJSON.path.points) {
        points = layerJSON.path.points
        isClosed = layerJSON.path.isClosed !== undefined ? layerJSON.path.isClosed : true
        console.log('[createLayerFromJSON] Found points in layerJSON.path.points, count:', points.length)
      } else if (layerJSON.points) {
        points = layerJSON.points
        isClosed = layerJSON.isClosed !== undefined ? layerJSON.isClosed : true
        console.log('[createLayerFromJSON] Found points in layerJSON.points, count:', points.length)
      }

      var hasPathData = points && points.length > 0

      if (hasPathData) {
        console.log('[createLayerFromJSON] === SHAPEPATH DEBUG INFO ===')
        console.log('[createLayerFromJSON] frame:', JSON.stringify(frame))
        console.log('[createLayerFromJSON] parentFrame:', parentFrame ? JSON.stringify(parentFrame) : 'null')
        console.log('[createLayerFromJSON] points count:', points.length)
        console.log('[createLayerFromJSON] ==============================')

        // DISABLED: ShapePath API is not available in all Sketch versions
        // Use sketch.Shape as fallback for better compatibility
        console.log('[createLayerFromJSON] Using sketch.Shape fallback (ShapePath API unavailable)')
        
        layer = new sketch.Shape({
          parent: parent,
          name: layerJSON.name || 'ShapePath',
          frame: {
            x: absoluteFrame.x,
            y: absoluteFrame.y,
            width: frame.width || 100,
            height: frame.height || 100
          },
          style: shapePathStyle
        })
      } else {
        // No path data, use default rectangle
        console.log('[createLayerFromJSON] No path data, using default rectangle')
        layer = new sketch.Shape({
          parent: parent,
          name: layerJSON.name || 'ShapePath',
          frame: {
            x: absoluteFrame.x,
            y: absoluteFrame.y,
            width: frame.width || 100,
            height: frame.height || 100
          },
          style: shapePathStyle
        })
      }

      console.log('[createLayerFromJSON] Created shapePath layer')
      break

    case 'rectangle':
      // Parse frame properly from html2sketch format
      var rectFrame = layerJSON.frame || {}
      var frameX = absoluteFrame.x
      var frameY = absoluteFrame.y
      var frameWidth = rectFrame.width || 100
      var frameHeight = rectFrame.height || 100

      // Build style object BEFORE creating the shape to prevent default black fill
      var shapeStyle = { fills: [], borders: [] }

      // Parse fills from JSON - handle solid colors (fillType: 0) and gradients (fillType: 1)
      console.log('[createLayerFromJSON] Parsing fills:', JSON.stringify(style.fills))
      if (style.fills && style.fills.length > 0) {
        var fill = style.fills[0]
        console.log('[createLayerFromJSON] Processing fill:', JSON.stringify(fill))
        // Apply solid fills (fillType: 0)
        if (fill.isEnabled !== false && fill.fillType === 0 && fill.color) {
          var fillColor = sketchColorToRgba(fill.color)
          console.log('[createLayerFromJSON] Solid fill color:', fillColor)
          if (fillColor) {
            shapeStyle.fills = [{
              color: fillColor,
              fillType: 0 // 0 = Solid fill type
            }]
          }
        } else if (false && fill.fillType === 1 && fill.gradient) {
          // TEMPORARILY DISABLED: Gradients may cause crashes
          console.log('[createLayerFromJSON] Gradient fill DISABLED to prevent crashes')
          // Use first gradient stop color as solid fill instead
          if (fill.gradient.stops && fill.gradient.stops.length > 0) {
            var firstStopColor = sketchColorToRgba(fill.gradient.stops[0].color)
            if (firstStopColor) {
              shapeStyle.fills = [{
                color: firstStopColor,
                fillType: 0
              }]
              console.log('[createLayerFromJSON] Using first gradient stop as solid fill:', firstStopColor)
            }
          }
        }
      }

      // Parse borders from JSON - support solid borders with color and thickness
      // Only add border if thickness > 0 (html2sketch often has borders with thickness: 0)
      if (style.borders && style.borders.length > 0) {
        var border = style.borders[0]
        // Check: isEnabled, fillType, has color, AND has positive thickness
        if (border.isEnabled !== false && border.fillType === 0 && border.color && (border.thickness || 0) > 0) {
          var borderColor = sketchColorToRgba(border.color)
          if (borderColor) {
            shapeStyle.borders = [{
              color: borderColor,
              fillType: 0, // 0 = Solid fill type
              thickness: border.thickness || 1,
              // Validate position: 0=Center, 1=Inside, 2=Outside
              position: border.position !== undefined ? Math.max(0, Math.min(2, border.position)) : 1 // 默认 Inside
            }]
          }
        }
      }

      // ===== 方案 B: 增强圆角解析逻辑 =====
      // 从多个可能的位置查找圆角数据（html2sketch 可能在不同位置输出）
      var cornerRadius = null

      // 1. Check fixedRadius (most common location)
      if (layerJSON.fixedRadius && layerJSON.fixedRadius > 0) {
        cornerRadius = layerJSON.fixedRadius
        console.log('[createLayerFromJSON] Found corner radius in fixedRadius:', cornerRadius)
      }

      // 2. Check points array (html2sketch often stores corner radius here)
      if (!cornerRadius && layerJSON.points && layerJSON.points.length > 0) {
        var firstPoint = layerJSON.points[0]
        if (firstPoint.cornerRadius && firstPoint.cornerRadius > 0) {
          cornerRadius = firstPoint.cornerRadius
          console.log('[createLayerFromJSON] Found corner radius in points:', cornerRadius)
        }
      }

      // 3. Check style.corners (individual corner radii)
      if (!cornerRadius && style.corners && style.corners.length === 4) {
        var firstRadius = style.corners[0].radius || 0
        var allSame = style.corners.every(function(c) { return (c.radius || 0) === firstRadius })
        if (allSame && firstRadius > 0) {
          cornerRadius = firstRadius
          console.log('[createLayerFromJSON] Found corner radius in style.corners:', cornerRadius)
        }
      }

      // 4. Check nested layers (for shapeGroups with rectangle children)
      if (!cornerRadius && layerJSON.layers && layerJSON.layers.length > 0) {
        for (var i = 0; i < layerJSON.layers.length; i++) {
          var nestedLayer = layerJSON.layers[i]
          if (nestedLayer.fixedRadius && nestedLayer.fixedRadius > 0) {
            cornerRadius = nestedLayer.fixedRadius
            console.log('[createLayerFromJSON] Found corner radius in nested layer.fixedRadius:', cornerRadius)
            break
          }
          if (nestedLayer.points && nestedLayer.points.length > 0) {
            var nestedPoint = nestedLayer.points[0]
            if (nestedPoint.cornerRadius && nestedPoint.cornerRadius > 0) {
              cornerRadius = nestedPoint.cornerRadius
              console.log('[createLayerFromJSON] Found corner radius in nested layer.points:', cornerRadius)
              break
            }
          }
        }
      }

      // 5. Log final result
      console.log('[createLayerFromJSON] Final corner radius value:', cornerRadius, '(source: ' + (cornerRadius ? 'found' : 'not found') + ')')

      // Corner radius will be applied after shape creation
      // (Sketch API doesn't support borderRadius in style object)

      // Parse opacity
      if (style.contextSettings?.opacity !== undefined) {
        shapeStyle.opacity = style.contextSettings.opacity
      }

      console.log('[createLayerFromJSON] Creating Shape with style:', JSON.stringify(shapeStyle))

      // Create the shape WITH style in constructor - this prevents default black fill
      layer = new sketch.Shape({
        parent: parent,
        name: layerJSON.name || 'Shape',
        frame: {
          x: frameX,
          y: frameY,
          width: frameWidth,
          height: frameHeight
        },
        style: shapeStyle
      })

      // DISABLED: Corner radius application may cause crashes
      // Apply corner radius after creation (Sketch API requires this)
      if (false && cornerRadius && cornerRadius > 0) {
        console.log('[createLayerFromJSON] Corner radius application DISABLED to prevent crashes')
        try {
          // Get the native layer to set corner radius
          var nativeLayer = layer.sketchObject
          if (nativeLayer && nativeLayer.layers && nativeLayer.layers().count() > 0) {
            // For Shape, the actual rectangle is in the first child layer
            var rectangleLayer = nativeLayer.layers().firstObject()
            if (rectangleLayer && rectangleLayer.setCornerRadiusFromComponents) {
              // Set uniform corner radius for all corners
              rectangleLayer.setCornerRadiusFromComponents(cornerRadius + '/' + cornerRadius + '/' + cornerRadius + '/' + cornerRadius)
              console.log('[createLayerFromJSON] Applied corner radius:', cornerRadius)
            } else if (rectangleLayer && typeof rectangleLayer.setFixedRadius === 'function') {
              // Alternative method for older Sketch versions
              rectangleLayer.setFixedRadius(cornerRadius)
              console.log('[createLayerFromJSON] Applied corner radius (legacy):', cornerRadius)
            }
          }
        } catch (radiusError) {
          console.log('[createLayerFromJSON] Could not apply corner radius:', radiusError)
          // Continue without corner radius
        }
      }

      // DISABLED: Shadows can cause crashes in Sketch
      // Apply shadows if present (must be applied after creation)
      if (false && style.shadows && style.shadows.length > 0) {
        var shadow = style.shadows[0]
        if (shadow.isEnabled !== false) {
          var shadowColor = sketchColorToRgba(shadow.color)
          if (shadowColor) {
            layer.style.shadows = [{
              color: shadowColor,
              blur: shadow.blurRadius || 0,
              x: shadow.offsetX || 0,
              y: shadow.offsetY || 0,
              spread: shadow.spread || 0
            }]
          }
        }
      }

      // DISABLED: Inner shadows can cause crashes - convert to borders only
      // Apply inner shadows - convert to borders where possible for better compatibility
      if (style.innerShadows && style.innerShadows.length > 0) {
        var hasConvertedToBorder = false

        // Check if we can simulate with borders (single-direction border effect)
        // For example: offsetY: -1, blur: 0 = top border
        style.innerShadows.forEach(function(innerShadow) {
          if (innerShadow.isEnabled !== false && innerShadow.blurRadius === 0) {
            var innerShadowColor = sketchColorToRgba(innerShadow.color)
            if (innerShadowColor) {
              var ox = innerShadow.offsetX || 0
              var oy = innerShadow.offsetY || 0

              // Detect single-direction shadow, convert to corresponding border
              if (ox === 0 && oy !== 0) {
                // Top or bottom border
                var borderPosition = oy < 0 ? 0 : 2  // 0=Top, 2=Bottom (Outer border)
                var newBorder = {
                  color: innerShadowColor,
                  fillType: 0,
                  thickness: Math.abs(oy),
                  position: borderPosition
                }
                layer.style.borders = layer.style.borders || []
                layer.style.borders.push(newBorder)
                hasConvertedToBorder = true
                console.log('[createLayerFromJSON] Converted innerShadow to border:', newBorder)
              } else if (oy === 0 && ox !== 0) {
                // Left or right border
                var borderPosition = ox < 0 ? 3 : 1  // 3=Left, 1=Right
                var newBorder = {
                  color: innerShadowColor,
                  fillType: 0,
                  thickness: Math.abs(ox),
                  position: borderPosition
                }
                layer.style.borders = layer.style.borders || []
                layer.style.borders.push(newBorder)
                hasConvertedToBorder = true
                console.log('[createLayerFromJSON] Converted innerShadow to border:', newBorder)
              }
            }
          }
        })

        // DISABLED: innerShadow API can cause crashes - skip complex shadows
        if (!hasConvertedToBorder) {
          console.log('[createLayerFromJSON] Skipping complex innerShadow (disabled to prevent crashes)')
        }
      }
      break

    case 'bitmap':
      // TEMPORARILY DISABLED - Testing if bitmap causes crashes
      console.log('[createLayerFromJSON] Skipping bitmap layer (temporarily disabled):', layerJSON.name)
      layer = new sketch.Shape({
        parent: parent,
        name: layerJSON.name || 'Bitmap (Disabled)',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 100,
          height: frame.height || 100
        },
        style: {
          fills: [{
            color: '#E5E5E5',
            fillType: 0
          }]
        }
      })
      break

    case 'image':
      // TEMPORARILY DISABLED - Testing if image causes crashes
      console.log('[createLayerFromJSON] Skipping image layer (temporarily disabled):', layerJSON.name)
      layer = new sketch.Shape({
        parent: parent,
        name: layerJSON.name || 'Image (Disabled)',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 100,
          height: frame.height || 100
        },
        style: {
          fills: [{
            color: '#CCCCCC',
            fillType: 0
          }]
        }
      })
      break

    default:
      console.log('[createLayerFromJSON] Unknown layer type:', layerClass, '- creating as group')
      layer = new sketch.Group({
        parent: parent,
        name: layerJSON.name || 'Unknown',
        frame: {
          x: absoluteFrame.x,
          y: absoluteFrame.y,
          width: frame.width || 100,
          height: frame.height || 100
        }
      })
  }

  // Process child layers recursively
  // Group/ShapeGroup 的子元素在 JSON 中已经是相对坐标，不需要再累加父级位置
  if (layerJSON.layers && layerJSON.layers.length > 0) {
    // Filter out unnecessary layers to prevent Sketch crashes
    var filteredChildren = layerJSON.layers.filter(function(childJSON) {
      // Skip empty overflow masks (common in html2sketch output)
      if (childJSON.name === 'Overflow 蒙层' || childJSON.name === '容器') {
        var hasContent = childJSON.layers && childJSON.layers.length > 0
        var hasVisibleStyle = childJSON.style && (
          (childJSON.style.fills && childJSON.style.fills.length > 0) ||
          (childJSON.style.borders && childJSON.style.borders.length > 0)
        )
        if (!hasContent && !hasVisibleStyle) {
          console.log('[createLayerFromJSON] Skipping empty container:', childJSON.name)
          return false
        }
      }

      // Skip shapes with zero or very small dimensions
      if (childJSON.frame && (childJSON.frame.width === 0 || childJSON.frame.height === 0)) {
        console.log('[createLayerFromJSON] Skipping zero-size layer:', childJSON.name)
        return false
      }
      
      // Skip layers with extremely small dimensions (< 0.1px)
      if (childJSON.frame && (childJSON.frame.width < 0.1 || childJSON.frame.height < 0.1)) {
        console.log('[createLayerFromJSON] Skipping tiny layer:', childJSON.name)
        return false
      }

      return true
    })

    console.log('[createLayerFromJSON] Processing', filteredChildren.length, 'of', layerJSON.layers.length, 'child layers')

    // Limit children count to prevent crashes
    var maxChildren = Math.min(filteredChildren.length, MAX_LAYERS - globalLayerCount)
    if (maxChildren < filteredChildren.length) {
      console.warn('[createLayerFromJSON] Limiting children from', filteredChildren.length, 'to', maxChildren, 'to prevent exceeding MAX_LAYERS')
    }

    // Process children in batches to prevent main thread blocking
    // Add small delays between batches to let Sketch process layers
    var successCount = 0
    var errorCount = 0
    
    for (var i = 0; i < maxChildren; i += CHILDREN_BATCH_SIZE) {
      var batch = filteredChildren.slice(i, Math.min(i + CHILDREN_BATCH_SIZE, maxChildren))

      batch.forEach(function(childJSON) {
        // Check if we should stop processing due to layer limit
        if (globalLayerCount >= MAX_LAYERS) {
          console.warn('[createLayerFromJSON] Stopping child processing - MAX_LAYERS reached')
          return
        }
        
        try {
          // 传递当前 frame 作为 parentFrame，以便子元素可以使用正确的尺寸进行坐标反归一化
          var childLayer = createLayerFromJSON(childJSON, layer, frame, depth + 1)
          if (childLayer) {
            successCount++
          }
        } catch (childError) {
          errorCount++
          console.error('[createLayerFromJSON] Error creating child layer:', childJSON.name, childError)
          // Continue with other children even if one fails
        }
      })

      // Log progress for large structures
      if (i > 0 && i % (CHILDREN_BATCH_SIZE * 5) === 0) {
        console.log('[createLayerFromJSON] Processed ' + i + '/' + maxChildren + ' children (depth: ' + depth + ', success: ' + successCount + ', errors: ' + errorCount + ')')
        
        // CRITICAL: Hint for garbage collection after processing many layers
        // This helps prevent memory buildup that causes crashes on complex designs
        if (typeof global !== 'undefined' && global.gc) {
          try {
            global.gc()
            console.log('[createLayerFromJSON] Forced GC after batch')
          } catch (e) {
            // GC not available, continue
          }
        }
      }
    }
    
    if (errorCount > 0) {
      console.warn('[createLayerFromJSON] Completed with ' + errorCount + ' errors out of ' + maxChildren + ' children')
    }
  }

  return layer
}

/**
 * Adjust frame for layers recursively
 */
function adjustFrame(layer) {
  switch (layer.type) {
    case 'Image':
    case 'ShapePath':
    case 'Artboard':
      break
    case 'Group':
    case 'Page':
    case 'Shape':
    case 'SymbolMaster':
      if (layer.layers && layer.layers.length !== 0) {
        layer.layers.forEach(adjustFrame)
      } else {
        layer.adjustToFit()
      }
      break
  }
}

/**
 * Create design from Sketch JSON (html2sketch output)
 * Based on: https://github.com/arvinxx/sketch-json/blob/master/src/sketch/commands/pasteSketchJSON.ts
 * @param {Object} sketchJSON - Sketch JSON from html2sketch
 * @param {Object} context - Sketch context
 * @returns {Object} - Created layer
 */
export function createDesignFromSketchJSON(sketchJSON, context) {
  console.log('[design-api] createDesignFromSketchJSON called')
  console.log('[design-api] Sketch JSON keys:', Object.keys(sketchJSON))

  try {
    // Validate JSON has _class property
    if (!sketchJSON._class) {
      throw new Error('Invalid Sketch JSON: missing _class property')
    }

    // Check JSON size
    var jsonSize = JSON.stringify(sketchJSON).length
    console.log('[design-api] Sketch JSON size:', (jsonSize / 1024 / 1024).toFixed(2), 'MB')
    if (jsonSize > MAX_JSON_SIZE) {
      throw new Error('Sketch JSON too large (>10MB). Please simplify the HTML design.')
    }

    // Estimate layer count from JSON structure
    function estimateLayerCount(json) {
      var count = 1
      if (json.layers && Array.isArray(json.layers)) {
        count += json.layers.length
        // Sample first few children to estimate depth
        for (var i = 0; i < Math.min(json.layers.length, 10); i++) {
          if (json.layers[i].layers) {
            count += json.layers[i].layers.length
          }
        }
      }
      return count
    }

    var estimatedLayers = estimateLayerCount(sketchJSON)
    console.log('[design-api] Estimated layer count:', estimatedLayers)

    if (estimatedLayers > MAX_LAYERS) {
      console.warn('[design-api] Warning: Estimated layers (' + estimatedLayers + ') exceeds limit (' + MAX_LAYERS + ')')
    }

    // CRITICAL: Reset global layer counter at start of conversion
    globalLayerCount = 0
    skippedLayerCount = 0
    console.log('[design-api] Global layer counter reset')
    
    // CRITICAL: Force garbage collection hint by clearing references
    // This helps prevent crashes on second/third conversions
    if (typeof global !== 'undefined' && global.gc) {
      try {
        global.gc()
        console.log('[design-api] Forced garbage collection')
      } catch (e) {
        console.log('[design-api] GC not available:', e)
      }
    }

    // Get the document
    var document = sketch.getSelectedDocument()
    if (!document) {
      throw new Error('No document selected')
    }

    // Use MSJSONDictionaryUnarchiver for native parsing
    console.log('[design-api] Creating layer from JSON using MSJSONDictionaryUnarchiver...')

    // Add version info if not present (required by Sketch unarchiver)
    if (!sketchJSON.do_objectID) {
      sketchJSON.do_objectID = generateUUID()
    }

    // Get the current page
    var page = document.selectedPage
    if (!page) {
      throw new Error('No page selected')
    }

    // Get the native page object
    var nativePage = page.sketchObject
    if (!nativePage) {
      throw new Error('Failed to get native page object')
    }

    // Always use manual layer creation since MSJSONDictionaryUnarchiver is unreliable
    console.log('[design-api] Using manual layer creation (MSJSONDictionaryUnarchiver is deprecated)')

    // Fall back to manual recursive layer creation
    console.log('[design-api] Using manual layer creation...')

    // Create the root artboard/group using manual approach with error handling
    var rootLayer = null
    try {
      rootLayer = createLayerFromJSON(sketchJSON, nativePage, null)
      if (!rootLayer) {
        throw new Error('Failed to create layer from JSON')
      }
      
      console.log('[design-api] Root layer created successfully')
      console.log('[design-api] Total layers created:', globalLayerCount)
      console.log('[design-api] Total layers skipped:', skippedLayerCount)
      
      if (skippedLayerCount > 0) {
        sketch.UI.message('设计已创建（部分层被跳过以防止崩溃）')
      }
    } catch (creationError) {
      console.error('[design-api] Error during layer creation:', creationError)
      console.error('[design-api] Error stack:', creationError.stack)
      throw new Error('Layer creation failed: ' + creationError.message)
    }

    // The manual approach already adds layers to parent
    // Don't try to select or convert - this can cause crashes with complex designs
    try {
      console.log('[design-api] Manual layer creation successful')
      console.log('[design-api] Total layers created:', globalLayerCount)
      console.log('[design-api] Total layers skipped:', skippedLayerCount)
      
      if (skippedLayerCount > 0) {
        sketch.UI.message('设计已创建（部分层被跳过以防止崩溃）')
      } else {
        sketch.UI.message('设计已创建')
      }

      // Return the native layer without conversion
      return rootLayer
    } catch (postError) {
      console.error('[design-api] Error in post-creation:', postError)
      // Still return the layer even if post-processing failed
      return rootLayer
    }
  } catch (error) {
    console.error('[design-api] Error creating design from Sketch JSON:', error)
    console.error('[design-api] Error stack:', error.stack)
    sketch.UI.message('创建设计失败: ' + error.message)
    throw error
  }
}

/**
 * Create design from specification (legacy method)
 * @param {Object} spec - Design specification
 * @param {Object} context - Sketch context
 * @returns {Object} - Created artboard layer
 */
export function createDesignFromSpec(spec, context) {
  var artboard = spec.artboard
  var layers = spec.layers
  var document = context.document
  var page = document.currentPage()

  // Create artboard
  var artboardLayer = createArtboard(artboard, page)

  // Create all layers
  layers.forEach(function(layer) {
    createLayer(layer, artboardLayer)
  })

  // Select the artboard
  document.selectedLayers.clearSelection()
  document.selectedLayers.addSelection(artboardLayer)

  return artboardLayer
}

/**
 * Create an artboard
 * @param {Object} data - Artboard data
 * @param {Object} page - Parent page
 * @returns {Object} - Created artboard
 */
function createArtboard(data, page) {
  var artboard = sketch.Artboard.fromType(sketch.BuiltinArtboardPreset.iPhone)

  artboard.name = data.name || 'Untitled'
  artboard.frame.x = data.x || 0
  artboard.frame.y = data.y || 0
  artboard.frame.width = data.width || 375
  artboard.frame.height = data.height || 812

  // Set background color
  artboard.backgroundColor = '#FFFFFF'

  page.addLayer(artboard)
  return artboard
}

/**
 * Create a layer from specification
 * @param {Object} data - Layer data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created layer
 */
function createLayer(data, parent) {
  switch (data.type) {
    case 'text':
      return createTextLayer(data, parent)
    case 'rectangle':
      return createRectangleLayer(data, parent)
    case 'button':
      return createButtonLayer(data, parent)
    case 'input':
      return createInputLayer(data, parent)
    case 'divider':
      return createDividerLayer(data, parent)
    case 'icon':
      return createIconLayer(data, parent)
    case 'image':
      return createImageLayer(data, parent)
    default:
      sketch.UI.message(`Unknown layer type: ${data.type}`)
      return null
  }
}

/**
 * Create a text layer
 * @param {Object} data - Text layer data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created text layer
 */
function createTextLayer(data, parent) {
  var text = new sketch.Text({
    parent: parent,
    text: data.content || 'Text',
    x: data.x || 0,
    y: data.y || 0,
    width: data.width || 200,
    height: data.fontSize || 24
  })

  text.style = {
    fontSize: data.fontSize || 16,
    fontFamily: data.fontFamily || 'PingFang SC',
    textColor: data.color || '#1D1D1F'
  }

  // Alignment
  if (data.align === 'center') {
    text.style.textAlign = 'center'
  } else if (data.align === 'right') {
    text.style.textAlign = 'right'
  }

  return text
}

/**
 * Create a rectangle/shape layer
 * @param {Object} data - Rectangle data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created shape
 */
function createRectangleLayer(data, parent) {
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.width || 100,
    data.height || 100
  )

  var shape = new sketch.Shape({
    parent: parent,
    frame: rect
  })

  shape.style = {
    fills: [{
      color: data.fillColor || '#F5F5F7',
      fillType: 0 // 0 = Solid fill type
    }],
    borders: []
  }

  // Apply corner radius using native API
  if (data.cornerRadius !== undefined && data.cornerRadius > 0) {
    try {
      var nativeLayer = shape.sketchObject
      if (nativeLayer && nativeLayer.layers && nativeLayer.layers().count() > 0) {
        var rectangleLayer = nativeLayer.layers().firstObject()
        if (rectangleLayer && typeof rectangleLayer.setFixedRadius === 'function') {
          rectangleLayer.setFixedRadius(data.cornerRadius)
        }
      }
    } catch (e) {
      console.log('[createRectangleLayer] Could not apply corner radius:', e)
    }
  }

  return shape
}

/**
 * Create a button layer
 * @param {Object} data - Button data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created button group
 */
function createButtonLayer(data, parent) {
  var group = new sketch.Group({
    parent: parent,
    name: data.name || 'Button'
  })

  // Button background
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.width || 120,
    data.height || 44
  )

  var shape = new sketch.Shape({
    parent: group,
    frame: rect,
    name: 'Background'
  })

  shape.style = {
    fills: [{
      color: data.fillColor || '#007AFF',
      fillType: 0 // 0 = Solid fill type
    }]
  }
  
  // Apply corner radius using native API
  if (data.cornerRadius || 8) {
    try {
      var nativeLayer = shape.sketchObject
      if (nativeLayer && nativeLayer.layers && nativeLayer.layers().count() > 0) {
        var rectangleLayer = nativeLayer.layers().firstObject()
        if (rectangleLayer && typeof rectangleLayer.setFixedRadius === 'function') {
          rectangleLayer.setFixedRadius(data.cornerRadius || 8)
        }
      }
    } catch (e) {
      console.log('[createButtonLayer] Could not apply corner radius:', e)
    }
  }

  // Button text
  var text = new sketch.Text({
    parent: group,
    text: data.text || 'Button',
    x: data.x || 0,
    y: data.y || 0,
    width: data.width || 120,
    height: data.height || 44
  })

  text.style = {
    fontSize: data.fontSize || 16,
    fontFamily: data.fontFamily || 'PingFang SC',
    textColor: data.textColor || '#FFFFFF',
    textAlign: 'center'
  }

  // Center text vertically
  text.frame.y = data.y + (data.height - (data.fontSize || 16)) / 2

  return group
}

/**
 * Create an input layer
 * @param {Object} data - Input data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created input group
 */
function createInputLayer(data, parent) {
  var group = new sketch.Group({
    parent: parent,
    name: data.name || 'Input'
  })

  // Input background
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.width || 300,
    data.height || 44
  )

  var shape = new sketch.Shape({
    parent: group,
    frame: rect,
    name: 'Background'
  })

  shape.style = {
    fills: [{
      color: data.fillColor || '#F5F5F7',
      fillType: 0 // 0 = Solid fill type
    }]
  }
  
  // Apply corner radius using native API
  if (data.cornerRadius || 8) {
    try {
      var nativeLayer = shape.sketchObject
      if (nativeLayer && nativeLayer.layers && nativeLayer.layers().count() > 0) {
        var rectangleLayer = nativeLayer.layers().firstObject()
        if (rectangleLayer && typeof rectangleLayer.setFixedRadius === 'function') {
          rectangleLayer.setFixedRadius(data.cornerRadius || 8)
        }
      }
    } catch (e) {
      console.log('[createInputLayer] Could not apply corner radius:', e)
    }
  }

  // Placeholder text
  if (data.placeholder) {
    var text = new sketch.Text({
      parent: group,
      text: data.placeholder,
      x: (data.x || 0) + 12,
      y: data.y || 0,
      width: (data.width || 300) - 24,
      height: data.height || 44
    })

    text.style = {
      fontSize: data.fontSize || 14,
      fontFamily: 'PingFang SC',
      textColor: data.placeholderColor || '#999999'
    }

    // Center text vertically
    text.frame.y = data.y + (data.height - (data.fontSize || 14)) / 2
  }

  return group
}

/**
 * Create a divider layer
 * @param {Object} data - Divider data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created divider
 */
function createDividerLayer(data, parent) {
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.width || 335,
    data.height || 1
  )

  var shape = new sketch.Shape({
    parent: parent,
    frame: rect,
    name: data.name || 'Divider'
  })

  shape.style = {
    fills: [{
      color: data.color || '#E5E5E5',
      fillType: 0 // 0 = Solid fill type
    }]
  }

  return shape
}

/**
 * Create an icon layer
 * @param {Object} data - Icon data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created icon
 */
function createIconLayer(data, parent) {
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.size || 24,
    data.size || 24
  )

  var shape = new sketch.Shape({
    parent: parent,
    frame: rect,
    name: data.name || 'Icon'
  })

  shape.style = {
    fills: [{
      color: data.fillColor || '#007AFF',
      fillType: 0 // 0 = Solid fill type
    }]
  }

  return shape
}

/**
 * Create an image placeholder layer
 * @param {Object} data - Image data
 * @param {Object} parent - Parent layer
 * @returns {Object} - Created image placeholder
 */
function createImageLayer(data, parent) {
  var rect = new sketch.Rectangle(
    data.x || 0,
    data.y || 0,
    data.width || 100,
    data.height || 100
  )

  var shape = new sketch.Shape({
    parent: parent,
    frame: rect,
    name: data.name || 'Image'
  })

  shape.style = {
    fills: [{
      color: data.fillColor || '#CCCCCC',
      fillType: 0 // 0 = Solid fill type
    }]
  }

  return shape
}
