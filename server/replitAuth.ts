// Reference: javascript_log_in_with_replit blueprint
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Make Replit auth optional for local development (required in production)
const isReplitConfigured = !!process.env.REPLIT_DOMAINS && !!process.env.REPL_ID;

if (!isReplitConfigured && process.env.NODE_ENV === 'production') {
  throw new Error("Environment variables REPLIT_DOMAINS and REPL_ID must be provided in production");
}

const getOidcConfig = memoize(
  async () => {
    if (!isReplitConfigured) {
      throw new Error("Replit authentication is not configured");
    }
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Only set up Replit auth if configured
  if (isReplitConfigured) {
    try {
      const config = await getOidcConfig();

      const verify: VerifyFunction = async (
        tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
        verified: passport.AuthenticateCallback
      ) => {
        const user = {};
        updateUserSession(user, tokens);
        await upsertUser(tokens.claims());
        verified(null, user);
      };

      for (const domain of process.env
        .REPLIT_DOMAINS!.split(",")) {
        const strategy = new Strategy(
          {
            name: `replitauth:${domain}`,
            config,
            scope: "openid email profile offline_access",
            callbackURL: `https://${domain}/api/callback`,
          },
          verify,
        );
        passport.use(strategy);
      }

      app.get("/api/login", (req, res, next) => {
        passport.authenticate(`replitauth:${req.hostname}`, {
          prompt: "login consent",
          scope: ["openid", "email", "profile", "offline_access"],
        })(req, res, next);
      });

      app.get("/api/callback", (req, res, next) => {
        passport.authenticate(`replitauth:${req.hostname}`, {
          successReturnToOrRedirect: "/",
          failureRedirect: "/api/login",
        })(req, res, next);
      });
    } catch (error) {
      console.warn("⚠️  Replit authentication setup failed. Continuing without Replit auth.", error);
      console.warn("   This is expected when running locally without Replit configuration.");
    }
  } else {
    console.log("ℹ️  Replit authentication is not configured. Running in local development mode.");
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get('/api/logout', (req, res) => {
  // Destroy the session
  req.session.destroy(err => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ message: 'Failed to log out.' });
      }

      // Clear the cookie (important for some setups)
      res.clearCookie('connect.sid', { path: '/' });

      // Respond with success
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  console.log('🧠 req.user:', req.user);
  console.log('🧠 isAuthenticated:', req.isAuthenticated());
  console.log('🧠 session:', req.session);

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!isReplitConfigured) {
    // In local development without Replit, token refresh is not available
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Role-based middleware
export const isVendor: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(userId);
  if (user?.role !== 'vendor') {
    return res.status(403).json({ message: "Forbidden: Vendor access required" });
  }
  
  // Check if vendor is approved - only approved vendors can access vendor endpoints
  const vendor = await storage.getVendorByUserId(userId);
  if (!vendor) {
    return res.status(403).json({ 
      message: "Vendor account not found",
      code: "VENDOR_NOT_FOUND",
      vendorStatus: null
    });
  }
  
  if (vendor.status !== "approved") {
    return res.status(403).json({ 
      message: `Your application is ${vendor.status}. Only approved vendors can access the platform.`,
      code: "VENDOR_NOT_APPROVED",
      vendorStatus: vendor.status,
      rejectionReason: vendor.rejectionReason || null
    });
  }
  
  next();
};

export const isCaptain: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(userId);
  if (user?.role !== 'captain') {
    return res.status(403).json({ message: "Forbidden: Captain access required" });
  }
  
  next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(userId);
  if (user?.role !== 'admin') {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  
  next();
};

export const isOwner: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(userId);
  if (user?.role !== 'owner') {
    return res.status(403).json({ message: "Forbidden: Owner access required" });
  }
  
  next();
};

export const isVendorOrOwner: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await storage.getUser(userId);
  if (user?.role !== 'vendor' && user?.role !== 'owner') {
    return res.status(403).json({ message: "Forbidden: Vendor or Owner access required" });
  }
  
  next();
};
