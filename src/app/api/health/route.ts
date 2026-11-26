import { NextResponse } from "next/server";
import { getPublicHealthStatus } from "@/lib/config";

export async function GET() {
  return NextResponse.json(getPublicHealthStatus());
}
