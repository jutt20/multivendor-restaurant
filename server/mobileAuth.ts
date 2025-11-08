import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Require JWT_SECRET to be set in production
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error("JWT_SECRET environment variable must be set in production");
}

// Use a development-only secret if not set (not for production!)
const SECRET_KEY = JWT_SECRET || "dev-secret-do-not-use-in-production";

export interface MobileAuthRequest extends Request {
  userId?: number;
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, SECRET_KEY, { expiresIn: '30d' });
}

export function verifyMobileAuth(req: MobileAuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Authentication required. Please provide Bearer token." });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, SECRET_KEY) as { userId: number };

    if (!decoded.userId) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("Mobile auth error:", error);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
