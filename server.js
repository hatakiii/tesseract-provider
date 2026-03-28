import "dotenv/config"; // Хамгийн дээд талд шууд import хийнэ
import express from "express";
import multer from "multer";
import tesseract from "node-tesseract-ocr";
import { unlink } from "fs/promises";
import os from "os";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve static files from the public directory so the frontend works both locally and on deployment
app.use(express.static(path.join(__dirname, "public")));

// --- АНХААРАХ ХЭСЭГ ---
// genAI-г global байдлаар биш, хэрэгцээтэй үед нь дууддаг функц болгох
const getGenAIModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  // Моделийн нэрийг gemini-1.5-flash болгож засав (2.5 одоогоор байхгүй)
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
};

const uploadDir = path.join(os.tmpdir(), "tesseract-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage: storage });

const config = {
  lang: "mon+eng",
  oem: 1,
  psm: 3,
};

app.post("/ocr", upload.array("files", 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Зураг сонгоогүй байна." });
    }

    const results = await Promise.all(
      req.files.map(async (file) => {
        try {
          const text = await tesseract.recognize(file.path, config);
          return text.trim();
        } catch (err) {
          return `Алдаа: ${file.originalname} уншиж чадсангүй.`;
        } finally {
          await unlink(file.path).catch(() => { });
        }
      })
    );

    const combinedText = results.join("\n\n---\n\n");
    let aiCorrected = "Текст олдсонгүй.";

    if (combinedText.trim()) {
      const model = getGenAIModel(); // Функцээр дамжуулж яг одоогийн process.env-г авна

      if (!model) {
        aiCorrected = "Алдаа: GEMINI_API_KEY тохируулаагүй байна.";
      } else {
        try {
          const prompt = `Доорх текстийг OCR-с буулгасан бөгөөд монгол хэл дээр байгаа болно. Үүнд үг үсгийн болон дүрмийн алдаанууд орсон байх магадлалтай. Энэхүү текстийг утга найруулга, дүрэм, үг үсгийн хувьд ямар ч алдаагүй цэвэр монгол хэлээр засаж өгнө үү. Илүү дутуу өөрийн тайлбаргүйгээр зөвхөн зассан текстийг л буцаана уу:\n\n${combinedText}`;
          const result = await model.generateContent(prompt);
          aiCorrected = result.response.text();
        } catch (err) {
          aiCorrected = "AI Алдаа: " + err.message;
        }
      }
    }

    res.json({
      count: results.length,
      combinedText: combinedText,
      aiCorrected: aiCorrected,
    });
  } catch (error) {
    res.status(500).json({ error: "Сервер дэалдаа гарлаа." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OCR Server running on ${PORT}`));