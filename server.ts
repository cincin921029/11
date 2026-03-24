import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for usernames (simulating a database)
  // Pre-populate with existing mock data names to prevent duplicates with them
  const usedUsernames = new Set([
    "Casey", "Alex", "Ben", "Frank", "Gina", "David", "Emily", "User", "Admin"
  ]);

  // API to check if a username is available
  app.get("/api/check-username", (req, res) => {
    const { username } = req.query;
    if (typeof username !== 'string') {
      return res.status(400).json({ error: "Invalid username" });
    }
    const normalized = username.trim();
    if (usedUsernames.has(normalized)) {
      return res.json({ available: false });
    }
    res.json({ available: true });
  });

  // API to register a username
  app.post("/api/register-username", (req, res) => {
    const { username, oldUsername } = req.body;
    if (typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: "Invalid username" });
    }
    const normalized = username.trim();
    
    // If updating, remove old one first (simplified logic)
    if (oldUsername && typeof oldUsername === 'string') {
        usedUsernames.delete(oldUsername.trim());
    }

    if (usedUsernames.has(normalized)) {
      return res.status(400).json({ error: "Username already taken" });
    }
    
    usedUsernames.add(normalized);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
