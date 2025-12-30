
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";
import { SearchHistory } from "./entity/SearchHistory";

dotenv.config();

const app = express();
// Fix: Cast middleware to any to resolve TypeScript overload resolution ambiguity where use() expects PathParams
app.use(express.json() as any);
// Fix: Cast middleware to any to resolve TypeScript overload resolution ambiguity where use() expects PathParams
app.use(cors() as any);

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log("Database initialized");

    app.get("/api/user/:telegramId", async (req, res) => {
      try {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ telegramId: req.params.telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
      } catch (err) {
        res.status(500).json({ error: "Internal error" });
      }
    });

    app.post("/api/user/sync", async (req, res) => {
      const { telegramId, name, username, phoneNumber } = req.body;
      if (!telegramId || !name) return res.status(400).json({ error: "Missing fields" });
      try {
        const userRepo = AppDataSource.getRepository(User);
        let user = await userRepo.findOneBy({ telegramId });
        if (user) {
          user.name = name;
          user.username = username;
          if (phoneNumber) user.phoneNumber = phoneNumber;
          await userRepo.save(user);
        } else {
          user = userRepo.create({ telegramId, name, username, phoneNumber });
          await userRepo.save(user);
        }
        res.json({ success: true, user });
      } catch (err) {
        res.status(500).json({ error: "Internal error" });
      }
    });

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
        res.status(500).json({ error: "Internal error" });
      }
    });

    app.post("/api/history", async (req, res) => {
      const { telegramId, term, sourceLang, targetLang, category } = req.body;
      try {
        const historyRepo = AppDataSource.getRepository(SearchHistory);
        const entry = historyRepo.create({ telegramId, term, sourceLang, targetLang, category });
        await historyRepo.save(entry);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Internal error" });
      }
    });

    app.get("/api/history/:telegramId", async (req, res) => {
      try {
        const historyRepo = AppDataSource.getRepository(SearchHistory);
        const history = await historyRepo.find({
          where: { telegramId: req.params.telegramId },
          order: { timestamp: "DESC" },
          take: 50
        });
        res.json(history);
      } catch (err) {
        res.status(500).json({ error: "Internal error" });
      }
    });

    app.listen(PORT, () => console.log(`Server on ${PORT}`));
  })
  .catch((err) => console.log("DB Error", err));
