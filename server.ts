
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";
import { SearchHistory } from "./entity/SearchHistory";
import { GlobalLexicon } from "./entity/GlobalLexicon";

dotenv.config();

const app = express();
app.use(express.json() as any);
app.use(cors() as any);

const PORT = process.env.PORT || 3000;

// TIER 2: In-Memory Hot Cache with LRU-style eviction
const hotCache = new Map<string, any>();
const MAX_CACHE_SIZE = 1500;

function addToHotCache(key: string, data: any) {
  if (hotCache.size >= MAX_CACHE_SIZE) {
    const firstKey = hotCache.keys().next().value;
    if (firstKey) hotCache.delete(firstKey);
  }
  hotCache.set(key, data);
}

AppDataSource.initialize()
  .then(() => {
    console.log("⚡ [Backend] Database Connected: PostgreSQL");

    // Fetch User Profile including XP
    app.get("/api/user/:telegramId", async (req, res) => {
      try {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ telegramId: req.params.telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
      } catch (err) {
        res.status(500).json({ error: "Profile fetch failure" });
      }
    });

    // Sync User & XP
    app.post("/api/user/sync", async (req, res) => {
      const { telegramId, name, username, phoneNumber } = req.body;
      try {
        const userRepo = AppDataSource.getRepository(User);
        let user = await userRepo.findOneBy({ telegramId });
        if (user) {
          user.name = name;
          user.username = username;
          await userRepo.save(user);
        } else {
          user = userRepo.create({ telegramId, name, username, phoneNumber, xp: 0 });
          await userRepo.save(user);
        }
        res.json({ success: true, user });
      } catch (err) {
        res.status(500).json({ error: "Sync failure" });
      }
    });

    // Atomic XP Increment
    app.post("/api/user/add-xp", async (req, res) => {
      const { telegramId, xp } = req.body;
      try {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });
        user.xp += xp;
        await userRepo.save(user);
        res.json({ success: true, newXp: user.xp });
      } catch (err) {
        res.status(500).json({ error: "XP update failure" });
      }
    });

    // History Retrieval
    app.get("/api/history/:telegramId", async (req, res) => {
      try {
        const historyRepo = AppDataSource.getRepository(SearchHistory);
        const history = await historyRepo.find({
          where: { telegramId: req.params.telegramId },
          order: { timestamp: "DESC" },
          take: 40
        });
        res.json(history);
      } catch (err) {
        res.status(500).json({ error: "History retrieval error" });
      }
    });

    // TIER 2 & 3: Global Dictionary Lookup
    app.get("/api/dictionary/lookup", async (req, res) => {
      const { term, src, trg } = req.query;
      const normalizedTerm = (term as string).trim().toLowerCase();
      const key = `${src}_${trg}_${normalizedTerm}`;
      
      // Tier 2 Hit
      if (hotCache.has(key)) {
        return res.json({ hit: true, data: hotCache.get(key) });
      }

      try {
        // Tier 3 Hit (Postgres Index)
        const lexiconRepo = AppDataSource.getRepository(GlobalLexicon);
        const result = await lexiconRepo.findOneBy({ 
          term: normalizedTerm, 
          sourceLang: src as string, 
          targetLang: trg as string 
        });

        if (result) {
          addToHotCache(key, result.data);
          return res.json({ hit: true, data: result.data });
        }
        res.status(404).json({ hit: false });
      } catch (err) {
        res.status(500).json({ error: "DB Lookup failed" });
      }
    });

    // TIER 3: Save definition globally
    app.post("/api/dictionary/save", async (req, res) => {
      const { term, sourceLang, targetLang, data } = req.body;
      try {
        const lexiconRepo = AppDataSource.getRepository(GlobalLexicon);
        const normalizedTerm = term.trim().toLowerCase();
        
        let entry = await lexiconRepo.findOneBy({ term: normalizedTerm, sourceLang, targetLang });
        if (!entry) {
          entry = lexiconRepo.create({ term: normalizedTerm, sourceLang, targetLang, data });
        } else {
          entry.data = data;
        }
        await lexiconRepo.save(entry);
        addToHotCache(`${sourceLang}_${targetLang}_${normalizedTerm}`, data);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Dictionary write error" });
      }
    });

    app.listen(PORT, () => console.log(`🚀 [Lexicon Server] Listening on ${PORT}`));
  })
  .catch((err) => console.log("Database Connection Failed:", err));
