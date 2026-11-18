/** Deletes ALL data and tables (development only):  npm run db:reset */
import 'dotenv/config';
import { Client } from 'pg';

(async () => {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'virtual_card_db',
  });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  console.log('Database emptied. Tables are re-created the next time the API or the seed starts.');
})().catch((e) => { console.error(e.message); process.exit(1); });
