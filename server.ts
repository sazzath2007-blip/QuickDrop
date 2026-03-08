import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Database setup
const db = new Database("files.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    filename TEXT,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

app.use(express.json());

// API Routes
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Generate a unique 6-digit code
  let code: string;
  let exists = true;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const row = db.prepare("SELECT id FROM files WHERE code = ?").get(code);
    exists = !!row;
  } while (exists);

  const stmt = db.prepare(`
    INSERT INTO files (code, filename, original_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    code,
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size
  );

  res.json({ code, filename: req.file.originalname });
});

app.get("/api/file/:code", (req, res) => {
  const { code } = req.params;
  const file = db.prepare("SELECT * FROM files WHERE code = ?").get(code) as any;

  if (!file) {
    return res.status(404).json({ error: "File not found or code expired" });
  }

  res.json({
    original_name: file.original_name,
    size: file.size,
    mime_type: file.mime_type,
    created_at: file.created_at
  });
});

app.get("/api/download/:code", (req, res) => {
  const { code } = req.params;
  const file = db.prepare("SELECT * FROM files WHERE code = ?").get(code) as any;

  if (!file) {
    return res.status(404).send("File not found");
  }

  const filePath = path.join(uploadsDir, file.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File missing on server");
  }

  res.download(filePath, file.original_name);
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
