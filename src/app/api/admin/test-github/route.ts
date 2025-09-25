import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 500 });
  }

  try {
    const octokit = new Octokit({
      auth: token,
    });

    // Intentar obtener el archivo
    const { data } = await octokit.rest.repos.getContent({
      owner: 'Rensoconese',
      repo: 'primos-app',
      path: 'src/data/nftMappings.ts',
      ref: 'main',
    });

    return NextResponse.json({
      success: true,
      fileExists: true,
      size: 'content' in data && !Array.isArray(data) ? data.size : 0,
      sha: 'content' in data && !Array.isArray(data) ? data.sha : null,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      status: error.status,
      tokenUsed: token.substring(0, 15) + '...',
      tokenFull: token, // TEMPORAL: Ver token completo para debug
    });
  }
}