import express from "express";
import rateLimit from "express-rate-limit"; // Tambahkan ini
import { createData, getPlanner } from "../controllers/AiController.js";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "../middleware/VerifyToken.js";

const prisma = new PrismaClient();
const router = express.Router();

// Konfigurasi Rate Limiter
const createDataLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Maksimum 100 permintaan per IP
    message: {
        error: "Too many requests, please try again later."
    },
});

// Terapkan Rate Limiter pada rute
router.post("/createdataai", verifyToken, createData);
router.get("/getplanner", verifyToken, getPlanner);

export default router;
