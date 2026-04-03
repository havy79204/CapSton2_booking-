const fs = require('fs').promises
const path = require('path')

async function fileToDataUrl(filePath) {
  const buf = await fs.readFile(filePath)
  const ext = path.extname(filePath).slice(1).toLowerCase() || 'jpg'
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${buf.toString('base64')}`
}

async function main() {
  const img = process.argv[2]
  if (!img) {
    console.error('Usage: node scripts/test_analyze_image.js <image-file> [optional prompt]')
    process.exit(2)
  }

  const prompt = process.argv[3] || ''
  const dataUrl = await fileToDataUrl(img)

  // require the aiChat service and call exported analyzer
  const ai = require('../src/services/aiChat.service')
  if (typeof ai.analyzeNailImageWithAI !== 'function') {
    console.error('analyzeNailImageWithAI is not exported from aiChat.service.js')
    process.exit(3)
  }

  console.log('Sending image to analyzer... (this may call external API)')
  try {
    const res = await ai.analyzeNailImageWithAI({ imageDataUrl: dataUrl, userPrompt: prompt })
    console.log('--- ANALYSIS RESULT ---')
    console.log(JSON.stringify(res, null, 2))
    // also save raw debug if present
    if (res && res._debug) {
      const outPath = path.join(process.cwd(), 'ai_analyzer_debug.txt')
      await fs.writeFile(outPath, String(res._debug || ''))
      console.log('Debug saved to', outPath)
    }
  } catch (err) {
    console.error('Analyzer call failed:', String(err && (err.message || err)))
    process.exit(4)
  }
}

main()
