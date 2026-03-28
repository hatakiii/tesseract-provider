import "dotenv/config";
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
app.use(express.static(path.join(__dirname, "public")));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy");

const uploadDir = path.join(os.tmpdir(), "tesseract-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
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

    // Бүх зургийг зэрэг боловсруулах (Promise.all ашиглан хурдасгана)
    const results = await Promise.all(
      req.files.map(async (file) => {
        try {
          const text = await tesseract.recognize(file.path, config);
          return text.trim();
        } catch (err) {
          console.error(`Error processing ${file.originalname}:`, err);
          return `Алдаа: ${file.originalname} файлыг уншиж чадсангүй.`;
        } finally {
          // Боловсруулж дуусаад устгах (алдаа гарсан ч устгана)
          await unlink(file.path).catch((e) =>
            console.error("Файл устгах үед алдаа:", e),
          );
        }
      }),
    );

    // Үр дүнг массив хэлбэрээр эсвэл нэгтгэсэн текстээр буцааж болно
    const combinedText = results.join("\n\n---\n\n");
    let aiCorrected = "Текст олдсонгүй.";

    if (combinedText.trim()) {
      try {
        if (!process.env.GEMINI_API_KEY) {
          aiCorrected = "Алдаа: GEMINI_API_KEY тохируулаагүй байна.";
        } else {
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const prompt = `Доорх текстийг OCR-с буулгасан бөгөөд монгол хэл дээр байгаа болно. Үүнд үг үсгийн болон дүрмийн алдаанууд орсон байх магадлалтай. Энэхүү текстийг утга найруулга, дүрэм, үг үсгийн хувьд ямар ч алдаагүй цэвэр монгол хэлээр засаж өгнө үү. Илүү дутуу өөрийн тайлбаргүйгээр зөвхөн зассан текстийг л буцаана уу:\n\n${combinedText}`;
          const result = await model.generateContent(prompt);
          aiCorrected = result.response.text();
        }
      } catch (err) {
        console.error("Gemini Error:", err);
        aiCorrected = "AI Алдаа: Хөрвүүлэхэд алдаа гарлаа. " + err.message;
      }
    }

    res.json({
      count: results.length,
      texts: results,
      combinedText: combinedText,
      aiCorrected: aiCorrected,
    });
  } catch (error) {
    console.error("OCR Batch Error:", error);
    res.status(500).json({ error: "Сервер дээр алдаа гарлаа." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OCR Server running on ${PORT}`));
