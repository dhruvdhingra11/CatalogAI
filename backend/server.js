require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// ─── Firebase Admin (for email OTP auth) ──────────────────────────────────────
let adminAuth = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    adminAuth = admin.auth();
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

    send({ type: 'done' });
  };

  jobQueue.enqueue(runJob)
    .catch(err => {
      console.error('Job error:', err.message);
      send({ type: 'error', error: err.message });
    })
    .finally(end);
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
