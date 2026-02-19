require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Step 1: Use Gemini vision to generate 8 prompts from the uploaded image
async function generatePrompts(imageBuffer, mimeType, productName) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const textPart = `You are a professional product photographer and creative director.
Given this product image and the product name "${productName}", generate exactly 8 highly specific image generation prompts.

First, think carefully about what this product is and exactly how it is used in real life. For example:
- A car door knob → shown installed on an actual car door, a hand gripping it
- A water bottle → someone actively drinking from it outdoors
- Headphones → worn on a person's head while working or commuting
- A knife → being used to chop vegetables on a cutting board

ECOMMERCE prompts (first 4):
- Product isolated on clean white or soft gradient background
- Professional studio lighting, sharp focus, multiple angles (front, side, 45-degree, close-up detail)
- Commercial product photography look, no people

IN-USE / CONTEXTUAL prompts (last 4):
- Show the product being used EXACTLY as it is designed to be used in its natural environment
- Do NOT place it generically "in a room" or "on a table" — it must be actively in use or installed/applied in context
- Include realistic details: hands using it, the surface/object it attaches to, the environment around it
- Natural or environmental lighting, photorealistic, high detail

Return ONLY a valid JSON array of exactly 8 strings with no markdown, no explanation, no code block. Example format:
["prompt one", "prompt two", "prompt three", "prompt four", "prompt five", "prompt six", "prompt seven", "prompt eight"]`;

  const result = await model.generateContent([textPart, imagePart]);
  const responseText = result.response.text().trim();

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Gemini did not return a valid JSON array of prompts.');

  const prompts = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(prompts) || prompts.length !== 8) {
    throw new Error(`Expected 8 prompts, got ${prompts.length}`);
  }
  return prompts;
}

// Step 2: Call Gemini image generation via REST API for each prompt
async function generateImage(prompt, imageBuffer, mimeType, productName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Product name: ${productName}\n\n${prompt}` },
          { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Image API error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  const parts = data.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find(p => p.inlineData?.data);
  if (!imagePart) {
    throw new Error('No image data returned from API.');
  }

  return imagePart.inlineData.data;
}

app.post('/api/generate', upload.single('image'), async (req, res) => {
  // SSE headers — keeps connection alive and streams data as it's ready
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering on Railway
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    if (!req.file) { send({ type: 'error', error: 'No image uploaded.' }); return res.end(); }
    if (!req.body.productName) { send({ type: 'error', error: 'Product name is required.' }); return res.end(); }

    const { productName } = req.body;
    const { buffer, mimetype } = req.file;

    console.log(`Generating prompts for: ${productName}`);
    const prompts = await generatePrompts(buffer, mimetype, productName);
    console.log('Prompts generated:', prompts);
    send({ type: 'prompts', prompts });

    for (let i = 0; i < prompts.length; i++) {
      const style = i < 4 ? 'ecommerce' : 'lifestyle';
      console.log(`Generating image ${i + 1}/8 (${style})...`);
      try {
        const imageData = await generateImage(prompts[i], buffer, mimetype, productName);
        send({ type: 'image', imageData, prompt: prompts[i], style, index: i });
      } catch (imgErr) {
        console.error(`Failed to generate image ${i + 1}:`, imgErr.message);
        send({ type: 'image', imageData: null, prompt: prompts[i], style, index: i, error: imgErr.message });
      }
    }

    send({ type: 'done' });
  } catch (err) {
    console.error('Error in /api/generate:', err.message);
    send({ type: 'error', error: err.message });
  }

  res.end();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
