// Loaded first by scripts so .env.local is in place before any module reads process.env.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
