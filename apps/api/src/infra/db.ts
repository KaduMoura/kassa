import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
    if (db) return db;

    try {
        client = new MongoClient(env.MONGO_URI);
        await client.connect();

        // Extract database name from URI or default to 'catalog'
        const dbName = new URL(env.MONGO_URI).pathname.replace('/', '') || 'catalog';
        db = client.db(dbName);

        console.info('✅ Connected to MongoDB Catalog');
        return db;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
}

export async function disconnectFromDatabase(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.info('🔌 Disconnected from MongoDB');
    }
}

export function getDb(): Db {
    if (!db) {
        throw new Error('Database not initialized. Call connectToDatabase() first.');
    }
    return db;
}
