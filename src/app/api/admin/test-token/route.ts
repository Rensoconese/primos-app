import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  
  return NextResponse.json({
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token ? token.substring(0, 15) + '...' : 'NO TOKEN',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
}