import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 } // 12MB
});

app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * AI Image Edit endpoint (proxy/adapter)
 * Expects multipart/form-data:
 *  - image: (file) required
 *  - mask:  (file) optional (PNG recommended)
 *  - prompt: (text) required
 *  - mode: (text) optional e.g. "clothes" | "background" | "color"
 *
 * If AI_IMAGE_ENDPOINT is set:
 *  - forwards the request to that endpoint and expects JSON:
 *      { imageBase64: "..." } OR { imageUrl: "..." }
 *
 * Demo mode:
 *  - returns the original image as base64
 */
app.post("/api/ai-edit", upload.fields([{ name: "image", maxCount: 1 }, { name: "mask", maxCount: 1 }]), async (req, res) => {
  try {
    const imageFile = req.files?.image?.[0];
    if (!imageFile) return res.status(400).json({ error: "Missing image file." });

    const prompt = (req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Missing prompt." });

    const maskFile = req.files?.mask?.[0] || null;
    const mode = (req.body?.mode || "").trim();

    const endpoint = process.env.AI_IMAGE_ENDPOINT?.trim();

    // ✅ If you have your own AI endpoint, forward to it
    if (endpoint) {
      const form = new FormData();
      form.append("image", new Blob([imageFile.buffer], { type: imageFile.mimetype }), imageFile.originalname);
      if (maskFile) {
        form.append("mask", new Blob([maskFile.buffer], { type: maskFile.mimetype }), maskFile.originalname);
      }
      form.append("prompt", prompt);
      if (mode) form.append("mode", mode);

      const r = await fetch(endpoint, { method: "POST", body: form });
      const data = await r.json().catch(() => ({}));

      if (!r.ok) {
        return res.status(502).json({ error: data?.error || `Upstream AI endpoint error (${r.status}).` });
      }

      // Return in a consistent format
      if (data.imageBase64) return res.json({ imageBase64: data.imageBase64 });
      if (data.imageUrl) return res.json({ imageUrl: data.imageUrl });

      return res.status(502).json({ error: "AI endpoint response missing imageBase64/imageUrl." });
    }

    // ✅ Demo Mode (no AI endpoint configured)
    const base64 = imageFile.buffer.toString("base64");
    res.json({
      demo: true,
      imageBase64: `data:${imageFile.mimetype};base64,${base64}`,
      note: "Demo Mode: configure AI_IMAGE_ENDPOINT on your server to enable real AI edits."
    });
  } catch (e) {
    res.status(500).json({ error: "Server error.", detail: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Photo Studio running on http://localhost:${PORT}`));