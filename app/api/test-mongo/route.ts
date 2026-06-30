import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const client = await clientPromise;

    // choose DB dynamically (NO DB NAME in env, as requested)
    const db = client.db("testdb"); // you can rename this freely here

    const collection = db.collection("users");

    // insert sample data
    await collection.insertOne({
      name: "Sakib",
      createdAt: new Date(),
    });

    // fetch data
    const users = await collection.find({}).toArray();

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}