import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

let gitCommitSha = '';
try {
  gitCommitSha = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
  gitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || '';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: gitCommitSha,
    NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID || '',
  },
  turbopack: {
    root: __dirname,
  },
  // Sin Content-Disposition explícito, varios navegadores descargan el PDF en
  // vez de mostrarlo. `inline` les pide abrirlo en el visor integrado.
  async headers() {
    return [
      {
        source: '/plan-trading-nq.pdf',
        headers: [
          { key: 'Content-Type', value: 'application/pdf' },
          { key: 'Content-Disposition', value: 'inline; filename="plan-trading-nq.pdf"' },
        ],
      },
    ];
  },
};

export default nextConfig;

