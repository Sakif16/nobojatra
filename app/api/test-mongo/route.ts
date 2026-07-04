import connectMongoDB from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const mongoose = await connectMongoDB();
    await mongoose.connection.db?.admin().ping();

    return NextResponse.json({
      success: true,
      connected: mongoose.connection.readyState === 1,
      database: mongoose.connection.name,
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);

    return NextResponse.json(
      { success: false, error: "Unable to connect to MongoDB" },
      { status: 500 },
    );
  }
}
