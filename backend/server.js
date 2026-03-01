require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const sharp = require('sharp');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadMulti = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).fields([
  { name: 'images', maxCount: 4 },
  { name: 'logo', maxCount: 1 },
]);

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ─── Firebase Admin (for email OTP auth + A+ save) ───────────────────────────
let adminAuth = null;
let adminDb = null;
let adminBucket = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'sellerstudio-54c06.firebasestorage.app',
    });
    adminAuth = admin.auth();
    adminDb = admin.firestore();
    adminBucket = admin.storage().bucket();
    console.log('Firebase Admin SDK initialized');
  } catch (err) {
    console.error('Firebase Admin init error:', err.message);
  }
}

// ─── Email (Resend — HTTP API, works on all cloud platforms) ─────────────────
let resendClient = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = require('resend');
  resendClient = new Resend(process.env.RESEND_API_KEY);
  console.log('Email service ready (Resend)');
}

// ─── OTP Store (in-memory) ────────────────────────────────────────────────────
// Map<email, { code, expires, attempts }>
const otpStore = new Map();
// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore) {
    if (now > data.expires) otpStore.delete(email);
  }
}, 5 * 60 * 1000);

// ─── Auth endpoints ───────────────────────────────────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });
    if (!adminAuth)     return res.status(503).json({ error: 'Auth service not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON.' });
    if (!resendClient) return res.status(503).json({ error: 'Email service not configured. Set RESEND_API_KEY.' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000, attempts: 0 });

    const { data, error } = await resendClient.emails.send({
      from: 'SellerStudio <noreply@sellerstudio.shop>',
      to: email,
      subject: `${code} is your SellerStudio login code`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:40px 32px;background:#fff;border-radius:16px;">
          <p style="font-size:1rem;font-weight:700;color:#0d0d1a;margin:0 0 6px;">SellerStudio</p>
          <h1 style="font-size:1.3rem;font-weight:800;color:#0d0d1a;margin:0 0 24px;">Your login code</h1>
          <div style="background:#f5f4ff;border:1.5px solid #ddd8ff;border-radius:12px;padding:28px;text-align:center;letter-spacing:0.2em;font-size:2.6rem;font-weight:800;color:#6c63ff;margin-bottom:20px;">${code}</div>
          <p style="color:#6b6b8a;font-size:0.87rem;line-height:1.6;margin:0;">This code expires in <strong>10 minutes</strong>.<br>If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    if (error) {
      console.error('Resend error:', JSON.stringify(error));
      throw new Error(error.message || 'Failed to send email.');
    }
    console.log('Resend sent, id:', data?.id);

    console.log(`OTP sent to ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Send OTP error:', err.message);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });
    if (!adminAuth)       return res.status(503).json({ error: 'Auth service not configured.' });

    const key = email.toLowerCase();
    const stored = otpStore.get(key);

    if (!stored)                   return res.status(400).json({ error: 'No code found. Please request a new one.' });
    if (Date.now() > stored.expires) { otpStore.delete(key); return res.status(400).json({ error: 'Code expired. Please request a new one.' }); }

    stored.attempts++;
    if (stored.attempts > 5) {
      otpStore.delete(key);
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }
    if (stored.code !== code) return res.status(400).json({ error: 'Incorrect code. Please try again.' });

    otpStore.delete(key);

    // Get or create Firebase user
    let uid;
    try {
      const user = await adminAuth.getUserByEmail(email);
      uid = user.uid;
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        const newUser = await adminAuth.createUser({ email, emailVerified: true });
        uid = newUser.uid;
      } else {
        throw err;
      }
    }

    const token = await adminAuth.createCustomToken(uid);
    console.log(`OTP verified for ${email}, uid=${uid}`);
    res.json({ token });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ─── Job Queue ─────────────────────────────────────────────────────────────────
// Limits concurrent generation jobs so the server stays stable under load.
// No external dependencies (Redis, etc.) — all in-process.
class JobQueue {
  constructor(concurrency = 3) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  get size() { return this.queue.length; }
  get active() { return this.running; }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._tick();
    });
  }

  _tick() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.running++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => { this.running--; this._tick(); });
    }
  }
}

const jobQueue = new JobQueue(parseInt(process.env.QUEUE_CONCURRENCY) || 3);

// ─── Backend Selection ─────────────────────────────────────────────────────────
// Set GOOGLE_PROJECT_ID in .env to use Vertex AI (recommended for production).
// Without it, falls back to Gemini API (AI Studio) using GEMINI_API_KEY.
const USE_VERTEX = !!process.env.GOOGLE_PROJECT_ID;
const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const LOCATION   = process.env.GOOGLE_LOCATION || 'us-central1';
// Model used for image generation on Vertex AI (must support responseModalities: IMAGE)
const VERTEX_IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL || 'gemini-2.0-flash-exp';
const VERTEX_TEXT_MODEL  = process.env.VERTEX_TEXT_MODEL  || 'gemini-2.5-pro';

let vertexAI = null;
let genAI    = null;

// Gemini API is always initialised — used for image generation regardless of backend
const { GoogleGenerativeAI } = require('@google/generative-ai');
genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

if (USE_VERTEX) {
  const { VertexAI } = require('@google-cloud/vertexai');

  const credentials = process.env.GOOGLE_CREDENTIALS_JSON
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    : undefined;

  vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: {
      ...(credentials ? { credentials } : {}),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  });

  console.log(`Backend: Vertex AI (text) + Gemini API (images)  project=${PROJECT_ID}`);
  console.log(`  Text model:  ${VERTEX_TEXT_MODEL}`);
  console.log(`  Image model: gemini-3-pro-image-preview (Gemini API)`);
} else {
  console.log('Backend: Gemini API (AI Studio) — text + images');
}

// ─── Prompt Templates ──────────────────────────────────────────────────────────
function promptSystemText(productName) {
  return `You are a professional product photographer and creative director.
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
}

function imageInstructionText(prompt, productName) {
  return `You are an AI product photographer. I am providing a reference image of a SPECIFIC real product.

YOUR TASK: Generate a new photorealistic product image following these rules:

1. PRODUCT FIDELITY (most important): The product in your output MUST be the EXACT same product shown in the reference image. Reproduce its precise colors, shape, design, branding, logo, texture, and physical appearance. Do NOT invent a generic or similar-looking product — use the reference image as the visual source of truth.

2. SCENE: ${prompt}

3. Product name for context only: ${productName}

The reference image is attached. Study it carefully and reproduce that exact product in the described scene.`;
}

// ─── Retry Helper ──────────────────────────────────────────────────────────────
async function withRetry(fn, { retries = 3, baseDelay = 2000, label = 'request' } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.status === 429 ||
                    err?.message?.includes('RESOURCE_EXHAUSTED');
      if (!is429 || attempt === retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
      console.log(`[${label}] 429 rate limit — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── Generate Prompts ──────────────────────────────────────────────────────────
async function generatePrompts(imageBuffer, mimeType, productName) {
  const promptText = promptSystemText(productName);
  const b64 = imageBuffer.toString('base64');
  let responseText;

  if (USE_VERTEX) {
    try {
      responseText = await withRetry(async () => {
        const model = vertexAI.getGenerativeModel({ model: VERTEX_TEXT_MODEL });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [
            { text: promptText },
            { inlineData: { mimeType, data: b64 } },
          ]}],
        });
        return result.response.candidates[0].content.parts[0].text.trim();
      }, { retries: 3, baseDelay: 2000, label: 'Vertex AI prompts' });
    } catch (err) {
      // Fallback to Gemini API if Vertex keeps failing
      console.warn('[Vertex AI] All retries failed, falling back to Gemini API:', err.message);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const result = await model.generateContent([
        promptText,
        { inlineData: { data: b64, mimeType } },
      ]);
      responseText = result.response.text().trim();
    }
  } else {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    const result = await model.generateContent([
      promptText,
      { inlineData: { data: b64, mimeType } },
    ]);
    responseText = result.response.text().trim();
  }

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Model did not return a valid JSON array of prompts.');

  const prompts = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(prompts) || prompts.length !== 8) {
    throw new Error(`Expected 8 prompts, got ${prompts.length}`);
  }
  return prompts;
}

// ─── Generate Bullet Points ────────────────────────────────────────────────────
async function generateBulletPoints(imageBuffer, mimeType, productName) {
  const prompt = `You are an expert Amazon.in and Flipkart product listing copywriter.
Analyze this product image and the product name "${productName}".
Write exactly 5 bullet points for this product's marketplace listing.

Rules for each bullet point:
- Start with a bold keyword in ALL CAPS followed by " – " (e.g. "PREMIUM QUALITY – ")
- 1-2 sentences. Be specific: mention materials, dimensions, compatibility, or exact use case where visible in the image
- Each of the 5 points highlights a different benefit: build quality, primary use case, compatibility/fit, pack contents or value, and trust/durability
- Written for Indian buyers on Amazon.in / Flipkart — practical, benefit-driven language
- No generic filler like "great product" or "perfect gift" — every point must contain real information

Return ONLY a valid JSON array of exactly 5 strings. No markdown code blocks, no explanation, no extra text.
Example format: ["PREMIUM MATERIAL – ...", "PERFECT FIT – ...", "WIDE COMPATIBILITY – ...", "COMPLETE PACKAGE – ...", "TRUSTED QUALITY – ..."]`;

  const imageBase64 = imageBuffer.toString('base64');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType, data: imageBase64 } },
    ]}],
  });
  const text = result.response.text();
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('No JSON array in bullet points response');
  const bullets = JSON.parse(match[0]);
  if (!Array.isArray(bullets) || bullets.length !== 5) throw new Error(`Expected 5 bullet points, got ${bullets.length}`);
  return bullets;
}

// ─── Resize Image (for Amazon A+ exact dimensions) ────────────────────────────
async function resizeImage(base64Png, width, height) {
  const buf = Buffer.from(base64Png, 'base64');
  const resized = await sharp(buf)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  return resized.toString('base64');
}

// ─── Generate A+ Copy ──────────────────────────────────────────────────────────
async function generateAPlusCopy(imageBuffer, mimeType, productTitle, brandName, description) {
  const prompt = `You are an expert Amazon A+ Content copywriter for Indian sellers.
Analyze this product image. Product: "${productTitle}" by brand "${brandName}".
Key features provided by the seller: ${description}

Write copy for 5 Amazon A+ Content modules. Follow Amazon's content guidelines strictly:
- No promotional phrases ("best seller", "#1", "free shipping", "discount")
- No pricing information
- No competitor mentions
- No emojis
- No ALL CAPS sentences (ALL CAPS allowed only for product feature keywords at start)
- No URLs, contact details, or external links
- Headlines max 150 characters. Body text max 200 characters.
- Write in clear, benefit-driven language for Indian buyers

Return ONLY a valid JSON object (no markdown, no code blocks, no explanation):
{
  "banner": {
    "headline": "compelling brand/product headline, max 150 chars",
    "tagline": "short supporting tagline, max 75 chars"
  },
  "hero": {
    "headline": "main value proposition headline, max 150 chars",
    "body": "2-3 sentences expanding on the headline, max 200 chars"
  },
  "features": [
    { "headline": "Feature 1 name, max 100 chars", "body": "1-2 sentences about this feature, max 200 chars" },
    { "headline": "Feature 2 name, max 100 chars", "body": "1-2 sentences about this feature, max 200 chars" },
    { "headline": "Feature 3 name, max 100 chars", "body": "1-2 sentences about this feature, max 200 chars" }
  ]
}`;

  const b64 = imageBuffer.toString('base64');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [
      { text: prompt },
      { inlineData: { mimeType, data: b64 } },
    ]}],
  });
  const text = result.response.text();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in A+ copy response');
  const copy = JSON.parse(match[0]);
  if (!copy.banner || !copy.hero || !Array.isArray(copy.features) || copy.features.length !== 3) {
    throw new Error('Invalid A+ copy structure returned');
  }
  return copy;
}

// ─── Generate A+ Module Image ──────────────────────────────────────────────────
// Same REST pattern as generateImage — returns base64 PNG
async function generateAPlusModule(prompt, imageBuffer, mimeType, logoBuffer, logoMime) {
  const b64 = imageBuffer.toString('base64');
  const inputParts = [
    { text: prompt },
    { inlineData: { mimeType, data: b64 } },
  ];
  if (logoBuffer) {
    inputParts.push({ inlineData: { mimeType: logoMime, data: logoBuffer.toString('base64') } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: inputParts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`A+ Image API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts;
  const imagePart = parts?.find(p => p.inlineData?.data);

  if (!imagePart) {
    const finishReason = candidate?.finishReason || 'unknown';
    throw new Error(`No image data returned for A+ module (${finishReason})`);
  }
  return imagePart.inlineData.data;
}

// ─── Generate Image ────────────────────────────────────────────────────────────
// Always uses Gemini API (AI Studio) — gemini-3-pro-image-preview is the only
// model that reliably supports product reference image → new image generation.
// Vertex AI is used only for text (prompt generation) above.
async function generateImage(prompt, imageBuffer, mimeType, productName) {
  const instruction = imageInstructionText(prompt, productName);
  const b64 = imageBuffer.toString('base64');

  {
    // Gemini API (AI Studio) via REST
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: instruction },
            { inlineData: { mimeType, data: b64 } },
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
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts;
    const imagePart = parts?.find(p => p.inlineData?.data);

    if (!imagePart) {
      const finishReason = candidate?.finishReason || 'unknown';
      const textPart = parts?.find(p => p.text);
      const detail = textPart
        ? `Model returned text: "${textPart.text.slice(0, 200)}"`
        : `finishReason=${finishReason}, parts=${JSON.stringify(parts ?? null)}`;
      console.error('No image in API response:', detail);
      throw new Error(`No image data returned (${finishReason}). ${textPart ? 'Model returned text instead of image.' : ''}`);
    }

    return imagePart.inlineData.data;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/queue-status', (req, res) => {
  res.json({
    queued: jobQueue.size,
    active: jobQueue.active,
    concurrency: jobQueue.concurrency,
    backend: USE_VERTEX ? 'vertex-ai' : 'gemini-api',
  });
});

app.post('/api/generate', upload.single('image'), (req, res) => {
  // SSE setup — keeps connection alive and streams data as it arrives
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering on Railway
  res.flushHeaders();

  const send = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
  const end  = ()     => { if (!res.writableEnded) res.end(); };

  if (!req.file)            { send({ type: 'error', error: 'No image uploaded.' });       return end(); }
  if (!req.body.productName){ send({ type: 'error', error: 'Product name is required.' }); return end(); }

  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
    console.log('[SSE] Client disconnected');
  });

  // Notify client if they'll need to wait in queue
  const isBusy = jobQueue.size > 0 || jobQueue.active >= jobQueue.concurrency;
  if (isBusy) {
    const position = jobQueue.size + 1;
    send({ type: 'queued', position, message: `You are #${position} in queue. Your generation will start soon...` });
  }

  const { productName } = req.body;
  const { buffer, mimetype } = req.file;

  const runJob = async () => {
    if (clientGone) return;

    send({ type: 'started' });
    console.log(`[Queue] Job started  active=${jobQueue.active}  waiting=${jobQueue.size}  product="${productName}"`);

    const prompts = await generatePrompts(buffer, mimetype, productName);
    console.log(`Prompts generated (${prompts.length})`);
    send({ type: 'prompts', prompts });

    // Start bullet point generation concurrently — non-blocking
    const bulletsPromise = generateBulletPoints(buffer, mimetype, productName)
      .then(bullets => {
        if (!clientGone) send({ type: 'bullets', bullets });
        console.log('[Bullets] Generated successfully');
      })
      .catch(err => console.error('[Bullets] Generation failed:', err.message));

    // Brief warm-up pause before image generation
    await new Promise(r => setTimeout(r, 2000));

    for (let i = 0; i < prompts.length; i++) {
      if (clientGone) break;

      const style = i < 4 ? 'ecommerce' : 'lifestyle';
      console.log(`Generating image ${i + 1}/8 (${style})...`);

      let imageData = null;
      let lastErr;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (clientGone) break;
        try {
          imageData = await generateImage(prompts[i], buffer, mimetype, productName);
          break;
        } catch (imgErr) {
          lastErr = imgErr;
          if (attempt < 2) {
            console.log(`Retrying image ${i + 1} (attempt ${attempt + 2}/3)...`);
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      }

      if (imageData) {
        send({ type: 'image', imageData, prompt: prompts[i], style, index: i });
      } else {
        console.error(`Failed image ${i + 1}:`, lastErr?.message);
        send({ type: 'image', imageData: null, prompt: prompts[i], style, index: i, error: lastErr?.message });
      }
    }

    // Ensure bullets have been sent before signalling done
    await bulletsPromise;
    send({ type: 'done' });
  };

  jobQueue.enqueue(runJob)
    .catch(err => {
      console.error('Job error:', err.message);
      send({ type: 'error', error: err.message });
    })
    .finally(end);
});

app.post('/api/generate-aplus', (req, res) => {
  uploadMulti(req, res, async (err) => {
    if (err) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      return res.end();
    }

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
    const end  = ()     => { if (!res.writableEnded) res.end(); };

    const files = req.files?.images || [];
    const logoFile = req.files?.logo?.[0] || null;
    const { productTitle, brandName, description } = req.body || {};

    if (files.length < 3) { send({ type: 'error', error: 'Please upload at least 3 product images.' }); return end(); }
    if (!productTitle)    { send({ type: 'error', error: 'Product title is required.' }); return end(); }
    if (!brandName)       { send({ type: 'error', error: 'Brand name is required.' }); return end(); }

    let clientGone = false;
    res.on('close', () => { clientGone = true; console.log('[A+ SSE] Client disconnected'); });

    const runAplusJob = async () => {
      if (clientGone) return;
      send({ type: 'started' });
      console.log(`[A+] Job started  product="${productTitle}"  brand="${brandName}"  images=${files.length}`);

      // Use the first uploaded image as the reference for all generations
      const refBuffer  = files[0].buffer;
      const refMime    = files[0].mimetype;
      const logoBuf    = logoFile ? logoFile.buffer : null;
      const logoMime   = logoFile ? logoFile.mimetype : null;
      const hasLogo    = !!logoFile;

      // Step 1: Generate copy first (text is baked into images)
      const copy = await generateAPlusCopy(refBuffer, refMime, productTitle, brandName, description || '');
      if (clientGone) return;
      send({ type: 'aplus_copy', copy });
      console.log('[A+] Copy generated');

      // Step 2: Generate 5 module images with text baked in
      const logoInstruction = hasLogo
        ? `A brand logo image is also attached as the LAST image. Place this EXACT logo (preserving its colors, shape, and design) in the top-right corner of the image at a small, tasteful size. Do NOT recreate or redraw the logo — use the attached logo image exactly as-is.`
        : `Place brand name "${brandName}" in small elegant text in the top-right corner.`;

      const modules = [
        {
          key: 'banner', width: 970, height: 300, useLogo: true,
          prompt: `You are a professional Amazon A+ Content designer. Create a wide landscape banner image (970x300 pixels aspect ratio).
Reference product image attached — reproduce this EXACT product with its precise colors, shape, branding.
Layout: Left half shows the product prominently on a clean white or very light background with professional studio lighting. Right half has a clean light background with this bold headline text in dark color: "${copy.banner.headline}" and below it this tagline in smaller text: "${copy.banner.tagline}". ${logoInstruction}
Style: Premium, minimalist, professional. No gradients that look cheap. Clean typography. Suitable for Amazon A+ Content banner module.
DO NOT include any prices, discount claims, or promotional badges.`,
        },
        {
          key: 'hero', width: 970, height: 600, useLogo: true,
          prompt: `You are a professional Amazon A+ Content designer. Create a wide lifestyle hero image (970x600 pixels aspect ratio).
Reference product image attached — reproduce this EXACT product with its precise colors, shape, branding.
Scene: Show the product "${productTitle}" being used in its natural, aspirational environment. High quality lifestyle photography style.
Add a semi-transparent dark overlay band at the bottom (about 30% height). In that overlay band, place this headline in large white bold text: "${copy.hero.headline}". Below the headline, place this body text in smaller white text: "${copy.hero.body}". ${logoInstruction}
Style: Aspirational, warm, high-quality photography aesthetic. Suitable for Amazon A+ Content hero module.
DO NOT include any prices, discount claims, or promotional badges.`,
        },
        {
          key: 'feature1', width: 300, height: 300, useLogo: false,
          prompt: `You are a professional Amazon A+ Content designer. Create a square feature highlight image (300x300 pixels aspect ratio).
Reference product image attached — reproduce this EXACT product with its precise colors, shape, branding.
Show a close-up detail shot or creative angle of the product "${productTitle}" that best highlights: "${copy.features[0].headline}".
Add a subtle dark gradient overlay at the bottom. Place this feature headline in bold white text at the bottom: "${copy.features[0].headline}". Below it in smaller white text: "${copy.features[0].body}".
Style: Clean, premium, focused. Suitable for Amazon A+ Content three-column feature module.
DO NOT include any prices, discount claims, or promotional badges.`,
        },
        {
          key: 'feature2', width: 300, height: 300, useLogo: false,
          prompt: `You are a professional Amazon A+ Content designer. Create a square feature highlight image (300x300 pixels aspect ratio).
Reference product image attached — reproduce this EXACT product with its precise colors, shape, branding.
Show a close-up detail shot or creative angle of the product "${productTitle}" that best highlights: "${copy.features[1].headline}".
Add a subtle dark gradient overlay at the bottom. Place this feature headline in bold white text at the bottom: "${copy.features[1].headline}". Below it in smaller white text: "${copy.features[1].body}".
Style: Clean, premium, focused. Suitable for Amazon A+ Content three-column feature module.
DO NOT include any prices, discount claims, or promotional badges.`,
        },
        {
          key: 'feature3', width: 300, height: 300, useLogo: false,
          prompt: `You are a professional Amazon A+ Content designer. Create a square feature highlight image (300x300 pixels aspect ratio).
Reference product image attached — reproduce this EXACT product with its precise colors, shape, branding.
Show a close-up detail shot or creative angle of the product "${productTitle}" that best highlights: "${copy.features[2].headline}".
Add a subtle dark gradient overlay at the bottom. Place this feature headline in bold white text at the bottom: "${copy.features[2].headline}". Below it in smaller white text: "${copy.features[2].body}".
Style: Clean, premium, focused. Suitable for Amazon A+ Content three-column feature module.
DO NOT include any prices, discount claims, or promotional badges.`,
        },
      ];

      for (const mod of modules) {
        if (clientGone) break;
        console.log(`[A+] Generating ${mod.key} (${mod.width}×${mod.height})...`);

        let imageData = null;
        let lastErr;

        for (let attempt = 0; attempt < 3; attempt++) {
          if (clientGone) break;
          try {
            const modLogo = mod.useLogo && logoBuf ? logoBuf : null;
            const modLogoMime = mod.useLogo && logoMime ? logoMime : null;
            const raw = await generateAPlusModule(mod.prompt, refBuffer, refMime, modLogo, modLogoMime);
            imageData = await resizeImage(raw, mod.width, mod.height);
            break;
          } catch (imgErr) {
            lastErr = imgErr;
            if (attempt < 2) {
              console.log(`[A+] Retrying ${mod.key} (attempt ${attempt + 2}/3)...`);
              await new Promise(r => setTimeout(r, 5000));
            }
          }
        }

        if (imageData) {
          send({ type: 'aplus_image', module: mod.key, imageData, width: mod.width, height: mod.height });
          console.log(`[A+] ${mod.key} done`);
        } else {
          console.error(`[A+] ${mod.key} failed:`, lastErr?.message);
          send({ type: 'aplus_image', module: mod.key, imageData: null, width: mod.width, height: mod.height, error: lastErr?.message });
        }
      }

      send({ type: 'done' });
    };

    jobQueue.enqueue(runAplusJob)
      .catch(err => {
        console.error('[A+] Job error:', err.message);
        send({ type: 'error', error: err.message });
      })
      .finally(end);
  });
});

// ─── Save A+ listing to Firebase (via Admin SDK) ────────────────────────────
app.post('/api/save-aplus', async (req, res) => {
  try {
    if (!adminDb || !adminBucket) {
      return res.status(503).json({ error: 'Firebase Admin not configured.' });
    }
    const { uid, productTitle, brandName, modules, copy } = req.body;
    if (!uid || !productTitle || !brandName || !modules || !copy) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Verify the user exists
    try { await adminAuth.getUser(uid); } catch { return res.status(401).json({ error: 'Invalid user.' }); }

    const genId = `aplus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const moduleOrder = ['banner', 'hero', 'feature1', 'feature2', 'feature3'];
    const moduleImageUrls = {};

    await Promise.all(
      moduleOrder.map(async (key) => {
        const imageData = modules[key];
        if (!imageData) return;
        const filePath = `aplus/${uid}/${genId}/${key}.png`;
        const file = adminBucket.file(filePath);
        const buffer = Buffer.from(imageData, 'base64');
        await file.save(buffer, { metadata: { contentType: 'image/png' }, public: true });
        moduleImageUrls[key] = `https://storage.googleapis.com/${adminBucket.name}/${filePath}`;
      })
    );

    const admin = require('firebase-admin');
    await adminDb.collection('aplusGenerations').add({
      userId: uid,
      productTitle,
      brandName,
      moduleImageUrls,
      copy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Save A+] Error:', err.message);
    res.status(500).json({ error: 'Failed to save A+ listing.' });
  }
});

// ─── Read A+ listings for Dashboard (via Admin SDK) ──────────────────────────
app.get('/api/aplus-generations', async (req, res) => {
  try {
    if (!adminDb) return res.status(503).json({ error: 'Firebase Admin not configured.' });
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'Missing uid parameter.' });
    try { await adminAuth.getUser(uid); } catch { return res.status(401).json({ error: 'Invalid user.' }); }

    const snap = await adminDb.collection('aplusGenerations').where('userId', '==', uid).get();
    const docs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt ? { seconds: data.createdAt.seconds } : null,
      };
    });
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json({ generations: docs });
  } catch (err) {
    console.error('[Load A+] Error:', err.message);
    res.status(500).json({ error: 'Failed to load A+ listings.' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    backend: USE_VERTEX ? 'vertex-ai' : 'gemini-api',
    queue: { active: jobQueue.active, queued: jobQueue.size, concurrency: jobQueue.concurrency },
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
