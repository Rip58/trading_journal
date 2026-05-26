import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || 'local',
  });
}
