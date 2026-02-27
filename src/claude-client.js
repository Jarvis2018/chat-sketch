/**
 * Generate HTML code by calling Claude CLI
 * Uses NSTask for Sketch plugin compatibility
 * @param {string} prompt - User's design description
 * @param {Object} options - Generation options
 * @param {string} options.deviceType - Target device ('ios', 'android', 'web')
 * @param {number} options.artboardWidth - Target artboard width in pixels
 * @param {string} options.model - AI model to use ('claude', 'gpt4')
 * @returns {Promise<string>} - Generated HTML code
 */
export function generateHTML(prompt, options = {}) {
  const { deviceType = 'ios', artboardWidth = 375, model = 'claude' } = options
  
  // Build system prompt for HTML generation
  const systemPrompt = buildHTMLSystemPrompt(deviceType, artboardWidth)
  const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}\n\nGenerate only the HTML code, no explanations.`
  
  return new Promise((resolve, reject) => {
    try {
      console.log('[Claude Client] Starting generateHTML')
      console.log('[Claude Client] Device:', deviceType, 'Width:', artboardWidth)
      
      // Create a temporary file for the prompt to avoid argument length issues
      var tempDir = NSTemporaryDirectory()
      var promptFile = tempDir.stringByAppendingPathComponent('sketch-claude-prompt.txt')
      console.log('[Claude Client] Temp file path:', promptFile)
      
      var promptData = NSString.stringWithString(fullPrompt).dataUsingEncoding(NSUTF8StringEncoding)
      promptData.writeToFile_atomically(promptFile, true)
      console.log('[Claude Client] Prompt written to temp file')

      // Use NSTask to execute Claude CLI
      var task = NSTask.alloc().init()
      var shell = '/bin/bash'
      // Add common bin paths to PATH to find claude command
      // Use --dangerously-skip-permissions to avoid permission prompts in non-interactive mode
      // Use --tools "" to disable all tools (file operations, bash, etc.)
      var command = `export PATH=$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin; claude --dangerously-skip-permissions --tools "" -p "$(cat '${promptFile}')"`
      console.log('[Claude Client] Command:', command)
      
      task.setLaunchPath(shell)
      task.setArguments(['-c', command])

      // Create pipe for output
      var outputPipe = NSPipe.alloc().init()
      var errorPipe = NSPipe.alloc().init()
      task.setStandardOutput(outputPipe)
      task.setStandardError(errorPipe)

      // Launch task
      console.log('[Claude Client] Launching task...')
      task.launch()

      // Wait for completion (blocking, but in a separate context)
      console.log('[Claude Client] Waiting for task to complete...')
      task.waitUntilExit()
      console.log('[Claude Client] Task completed')

      // Read output
      var outputData = outputPipe.fileHandleForReading().readDataToEndOfFile()
      var errorData = errorPipe.fileHandleForReading().readDataToEndOfFile()
      console.log('[Claude Client] Output data length:', outputData.length())
      console.log('[Claude Client] Error data length:', errorData.length())

      var output = NSString.alloc().initWithData_encoding_(outputData, NSUTF8StringEncoding)
      var error = NSString.alloc().initWithData_encoding_(errorData, NSUTF8StringEncoding)
      console.log('[Claude Client] Output string:', String(output).substring(0, 200))
      console.log('[Claude Client] Error string:', String(error))

      // Clean up temp file
      var fileManager = NSFileManager.defaultManager()
      fileManager.removeItemAtPath_error(promptFile, null)
      console.log('[Claude Client] Temp file cleaned up')

      var terminationStatus = task.terminationStatus()
      console.log('[Claude Client] Termination status:', terminationStatus)

      if (terminationStatus === 0) {
        try {
          console.log('[Claude Client] Extracting HTML...')
          var html = extractHTML(output)
          console.log('[Claude Client] HTML extracted successfully, length:', html.length)
          
          // Validate HTML
          if (!validateHTML(html)) {
            reject(new Error('Generated HTML is invalid or empty'))
            return
          }
          
          resolve(html)
        } catch (parseError) {
          console.error('[Claude Client] Parse error:', parseError)
          reject(new Error(`Failed to extract HTML: ${parseError.message}\nOutput: ${output}`))
        }
      } else {
        console.error('[Claude Client] Command failed with exit code:', terminationStatus)
        reject(new Error(`Claude CLI error (exit code ${terminationStatus}): ${error || 'Unknown error'}`))
      }

    } catch (err) {
      console.error('[Claude Client] Exception:', err)
      reject(new Error(`Failed to launch Claude CLI: ${err.message || err.toString()}`))
    }
  })
}

/**
 * Generate design specification by calling Claude CLI (legacy function)
 * Uses NSTask for Sketch plugin compatibility
 * @param {string} prompt - The full prompt including system prompt
 * @returns {Promise<Object>} - Parsed design specification
 */
export function generateDesignSpec(prompt) {
  return new Promise((resolve, reject) => {
    try {
      console.log('[Claude Client] Starting generateDesignSpec')
      
      // Create a temporary file for the prompt to avoid argument length issues
      var tempDir = NSTemporaryDirectory()
      var promptFile = tempDir.stringByAppendingPathComponent('sketch-claude-prompt.txt')
      console.log('[Claude Client] Temp file path:', promptFile)
      
      var promptData = NSString.stringWithString(prompt).dataUsingEncoding(NSUTF8StringEncoding)
      promptData.writeToFile_atomically(promptFile, true)
      console.log('[Claude Client] Prompt written to temp file')

      // Use NSTask to execute Claude CLI
      var task = NSTask.alloc().init()
      var shell = '/bin/bash'
      // Add common bin paths to PATH to find claude command
      var command = `export PATH=$PATH:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin; claude -p "$(cat '${promptFile}')"`
      console.log('[Claude Client] Command:', command)
      
      task.setLaunchPath(shell)
      task.setArguments(['-c', command])

      // Create pipe for output
      var outputPipe = NSPipe.alloc().init()
      var errorPipe = NSPipe.alloc().init()
      task.setStandardOutput(outputPipe)
      task.setStandardError(errorPipe)

      // Launch task
      console.log('[Claude Client] Launching task...')
      task.launch()

      // Wait for completion (blocking, but in a separate context)
      console.log('[Claude Client] Waiting for task to complete...')
      task.waitUntilExit()
      console.log('[Claude Client] Task completed')

      // Read output
      var outputData = outputPipe.fileHandleForReading().readDataToEndOfFile()
      var errorData = errorPipe.fileHandleForReading().readDataToEndOfFile()
      console.log('[Claude Client] Output data length:', outputData.length())
      console.log('[Claude Client] Error data length:', errorData.length())

      var output = NSString.alloc().initWithData_encoding_(outputData, NSUTF8StringEncoding)
      var error = NSString.alloc().initWithData_encoding_(errorData, NSUTF8StringEncoding)
      console.log('[Claude Client] Output string:', String(output).substring(0, 200))
      console.log('[Claude Client] Error string:', String(error))

      // Clean up temp file
      var fileManager = NSFileManager.defaultManager()
      fileManager.removeItemAtPath_error(promptFile, null)
      console.log('[Claude Client] Temp file cleaned up')

      var terminationStatus = task.terminationStatus()
      console.log('[Claude Client] Termination status:', terminationStatus)

      if (terminationStatus === 0) {
        try {
          console.log('[Claude Client] Parsing design spec...')
          var spec = parseDesignSpec(output)
          console.log('[Claude Client] Spec parsed successfully:', spec)
          resolve(spec)
        } catch (parseError) {
          console.error('[Claude Client] Parse error:', parseError)
          reject(new Error(`Failed to parse design spec: ${parseError.message}\nOutput: ${output}`))
        }
      } else {
        console.error('[Claude Client] Command failed with exit code:', terminationStatus)
        reject(new Error(`Claude CLI error (exit code ${terminationStatus}): ${error || 'Unknown error'}`))
      }

    } catch (err) {
      console.error('[Claude Client] Exception:', err)
      reject(new Error(`Failed to launch Claude CLI: ${err.message || err.toString()}`))
    }
  })
}

/**
 * Parse design specification from Claude output
 * @param {string} output - Raw output from Claude
 * @returns {Object} - Parsed design specification
 */
function parseDesignSpec(output) {
  // Convert NSString to regular string if needed
  var str = output ? output.toString() : ''

  // Try to extract JSON from the output
  // The output might contain markdown code blocks or additional text

  // Remove markdown code blocks
  var cleanedOutput = str
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  // Try to find JSON object in the output
  var jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('No JSON found in Claude output')
  }

  try {
    var spec = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!spec.artboard) {
      throw new Error('Missing artboard in spec')
    }
    if (!spec.layers || !Array.isArray(spec.layers)) {
      throw new Error('Missing or invalid layers in spec')
    }

    return spec
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`)
    }
    throw error
  }
}

/**
 * Build system prompt for HTML generation
 * @param {string} deviceType - Target device type
 * @param {number} artboardWidth - Target artboard width
 * @returns {string} - System prompt
 */
function buildHTMLSystemPrompt(deviceType, artboardWidth) {
  const deviceGuidelines = {
    ios: 'iOS design patterns with SF Pro font family',
    android: 'Material Design guidelines with Roboto font family',
    web: 'flexible responsive layouts with system fonts'
  }
  
  const guideline = deviceGuidelines[deviceType] || deviceGuidelines.ios
  
  return `You are a UI design expert that generates HTML code for mobile and web interfaces.

Target Device: ${deviceType}
Artboard Width: ${artboardWidth}px

Requirements:
- Generate complete HTML with inline CSS styles
- Use semantic HTML5 elements
- Include all styles inline (no external CSS files)
- Use web-safe fonts or system fonts (Arial, Helvetica, sans-serif)
- Follow ${guideline}
- Ensure responsive layout within ${artboardWidth}px width
- No JavaScript or external dependencies
- Use flexbox or CSS grid for layouts
- Include proper spacing and padding
- Use appropriate colors and typography`
}

/**
 * Extract HTML from Claude output
 * @param {string} output - Raw output from Claude
 * @returns {string} - Extracted HTML code
 */
function extractHTML(output) {
  // Convert NSString to regular string if needed
  var str = output ? output.toString() : ''

  // Remove markdown code blocks
  var cleanedOutput = str
    .replace(/```html\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  // If the output starts with <!DOCTYPE or <html, use it directly
  if (cleanedOutput.match(/^\s*<!DOCTYPE/i) || cleanedOutput.match(/^\s*<html/i)) {
    return cleanedOutput
  }

  // Try to find HTML in the output
  var htmlMatch = cleanedOutput.match(/<!DOCTYPE[\s\S]*<\/html>/i) || 
                  cleanedOutput.match(/<html[\s\S]*<\/html>/i)

  if (htmlMatch) {
    return htmlMatch[0]
  }

  // If no full HTML document found, check if it's just body content
  if (cleanedOutput.includes('<') && cleanedOutput.includes('>')) {
    // Wrap in basic HTML structure
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
${cleanedOutput}
</body>
</html>`
  }

  throw new Error('No HTML found in Claude output')
}

/**
 * Validate HTML code
 * @param {string} html - HTML code to validate
 * @returns {boolean} - True if valid
 */
function validateHTML(html) {
  if (!html || typeof html !== 'string') {
    console.error('HTML is empty or not a string')
    return false
  }
  
  // Check for basic HTML structure
  if (!html.includes('<') || !html.includes('>')) {
    console.error('HTML does not contain valid tags')
    return false
  }
  
  // Check minimum length
  if (html.length < 20) {
    console.error('HTML is too short')
    return false
  }
  
  return true
}

/**
 * Validate design specification
 * @param {Object} spec - Design specification to validate
 * @returns {boolean} - True if valid
 */
export function validateSpec(spec) {
  if (!spec.artboard) {
    console.error('Missing artboard')
    return false
  }
  if (!spec.layers || !Array.isArray(spec.layers)) {
    console.error('Missing or invalid layers')
    return false
  }
  return true
}
