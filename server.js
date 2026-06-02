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
let cloudinaryAvailable = cloudinaryConfigured;

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn("Cloudinary is not configured. Uploads will be stored locally.");
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));
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

  const filename = `profile-${Date.now()}${path.extname(req.file.originalname) || ".jpg"}`;
  const filePath = path.join(uploadsDir, filename);

  try {
    if (cloudinaryAvailable) {
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

      if (uploadResult?.secure_url) {
        const profile = { imageUrl: uploadResult.secure_url };
        writeProfile(profile);
        return res.json(profile);
      }

      throw new Error("Cloudinary upload returned no secure_url.");
    }
  } catch (error) {
    console.error("Cloudinary upload failed, falling back to local storage:", error);
    cloudinaryAvailable = false;
  }

  try {
    fs.writeFileSync(filePath, req.file.buffer);
    const profile = { imageUrl: `${backendUrl}/uploads/${filename}` };
    writeProfile(profile);
    return res.json(profile);
  } catch (error) {
    console.error("Local upload failed:", error);
    return res.status(500).json({ error: "Could not upload image." });
  }
});

app.get("/", (req, res) => {
  res.send({ status: "backend running" });
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
