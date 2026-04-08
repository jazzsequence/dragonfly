import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

export const webhookConfig = {
  secret: process.env.WEBHOOK_SECRET ?? '',
  rebuildCommand: 'npm run build',
  branch: 'main',
  port: Number(process.env.WEBHOOK_PORT ?? 4322),
};

function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) return true;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  return expected === signature;
}

const srv = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString('utf-8');

  const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
  if (!verifySignature(body, signature, webhookConfig.secret)) {
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  let payload: { ref?: string };
  try {
    payload = JSON.parse(body) as { ref?: string };
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  const pushedBranch = payload.ref?.replace('refs/heads/', '');
  if (pushedBranch !== webhookConfig.branch) {
    res.writeHead(200);
    res.end(`Skipped: branch ${pushedBranch}`);
    return;
  }

  res.writeHead(202);
  res.end('Rebuild triggered');

  console.log(`[webhook] Rebuilding on push to ${webhookConfig.branch}...`);
  try {
    execSync(webhookConfig.rebuildCommand, { stdio: 'inherit' });
    console.log('[webhook] Rebuild complete.');
  } catch (err) {
    console.error('[webhook] Rebuild failed:', err);
  }
});

srv.listen(webhookConfig.port, () => {
  console.log(`[webhook] Listening on port ${webhookConfig.port}`);
});
