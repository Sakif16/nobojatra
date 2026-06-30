import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI as string;
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

if (!uri) {
  throw new Error("Please define MONGODB_URI in .env file");
}

// Global cache (prevents multiple connections in dev)
let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}

clientPromise = global._mongoClientPromise;

export default clientPromise;