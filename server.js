import express from "express";
import multer from "multer";
import tesseract from "node-tesseract-ocr";
import { unlink } from "fs/promises";
import os from "os";
import cors from "cors";

const app = express();
app.use(cors());

// Dockerfile-д үүсгэсэн /tmp/uploads фолдерыг ашиглах
const upload = multer({ dest: '/tmp/uploads' });

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
          await unlink(file.path).catch(e => console.error("Файл устгах үед алдаа:", e));
        }
      }),
    );

    // Үр дүнг массив хэлбэрээр эсвэл нэгтгэсэн текстээр буцааж болно
    res.json({
      count: results.length,
      texts: results, // Тус бүрд нь массив болгож авбал илүү цэгцтэй
      combinedText: results.join("\n\n---\n\n"), // Бүгдийг нь нийлүүлсэн хувилбар
    });
  } catch (error) {
    console.error("OCR Batch Error:", error);
    res.status(500).json({ error: "Сервер дээр алдаа гарлаа." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OCR Server running on ${PORT}`));
