import express from "express";
import cors from "cors";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, "data", "profile.json");

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.error("Cloudinary is not configured. Uploads are disabled. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "https://ahmedfrontend.vercel.app",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // allow Vercel deployments under *.vercel.app
    try {
      const hostname = new URL(origin).hostname;
      if (hostname && hostname.endsWith('.vercel.app')) return callback(null, true);
    } catch (e) {
      // ignore URL parse errors
    }
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Note: local uploads folder is kept for legacy/testing but uploads are
// intentionally disabled in production; we enforce Cloudinary-only uploads.
app.use("/uploads", express.static(uploadsDir));

const readProfile = () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (err) {
    return { imageUrl: null };
  }
};

const writeProfile = (data) => {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
};

app.get("/api/profile-image", (req, res) => {
  const profile = readProfile();
  return res.json({ imageUrl: profile.imageUrl || null });
});

app.post("/api/upload-profile", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file provided." });
  }

  if (!cloudinaryConfigured) {
    return res.status(500).json({ error: "Cloudinary is not configured on the server. Uploads are disabled." });
  }

  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "portfolio-profile" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      stream.end(req.file.buffer);
    });

    if (!uploadResult || !uploadResult.secure_url) {
      console.error('Cloudinary upload returned invalid response:', uploadResult);
      return res.status(500).json({ error: 'Cloudinary upload failed.' });
    }

    const profile = { imageUrl: uploadResult.secure_url };
    writeProfile(profile);
    return res.json(profile);
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return res.status(500).json({ error: "Could not upload image to Cloudinary.", details: error.message || String(error) });
  }
});

app.get("/", (req, res) => {
  res.send({ status: "backend running" });
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
