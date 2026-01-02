
import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entity/User";
import { SearchHistory } from "./entity/SearchHistory";
import { GlobalLexicon } from "./entity/GlobalLexicon";

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "uzger_lexicon",
    synchronize: true, // Only for development
    logging: false,
    entities: [User, SearchHistory, GlobalLexicon],
    migrations: [],
    subscribers: [],
});
