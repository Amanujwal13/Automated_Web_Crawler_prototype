import express, { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CRAWLER_DIR = path.resolve(__dirname, 'crawler');

app.use(express.json());

interface ActiveJob {
  id: string;
  type: 'crawl' | 'resume';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  exitCode: number | null;
  logs: string[];
}

let currentJob: ActiveJob | null = null;

// Helper to run python script and return parsed JSON
function runPythonBridge(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [path.join(CRAWLER_DIR, 'api_bridge.py'), ...args], {
      cwd: CRAWLER_DIR,
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(stderr || `Bridge exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        resolve({ error: 'Failed to parse JSON', raw: stdout, stderr });
      }
    });
  });
}

// API Routes
app.get('/api/status', (req: Request, res: Response) => {
  const dbExists = fs.existsSync(path.join(CRAWLER_DIR, 'crawl.db'));
  const configExists = fs.existsSync(path.join(CRAWLER_DIR, 'config.yaml'));
  res.json({
    ok: true,
    target: 'books.toscrape.com',
    dbInitialized: dbExists,
    configExists,
    activeJob: currentJob,
  });
});

app.get('/api/runs', async (req: Request, res: Response) => {
  try {
    const data = await runPythonBridge(['runs']);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs/:id', async (req: Request, res: Response) => {
  try {
    const data = await runPythonBridge(['run-detail', req.params.id]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs/:id/log', (req: Request, res: Response) => {
  const runId = req.params.id;
  const logPath = path.join(CRAWLER_DIR, 'output', runId, 'run.log');
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8');
    res.type('text/plain').send(content);
  } else {
    res.status(404).send('Log file not found');
  }
});

app.get('/api/runs/:id/data', (req: Request, res: Response) => {
  const runId = req.params.id;
  const dataPath = path.join(CRAWLER_DIR, 'output', runId, 'data.json');
  if (fs.existsSync(dataPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="data-${runId}.json"`);
    res.sendFile(dataPath);
  } else {
    res.status(404).json({ error: 'data.json not found for this run' });
  }
});

app.post('/api/crawl', (req: Request, res: Response) => {
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: 'A crawl job is already in progress' });
  }

  const { urls, delay } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }

  // Filter and sanitize URLs
  const cleanUrls = urls
    .map((u: string) => u.trim())
    .filter((u: string) => u.length > 0 && !u.startsWith('#'));

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: 'No valid URLs provided' });
  }

  // Write temporary urls file
  const tmpSeedFile = path.join(CRAWLER_DIR, `seed_${Date.now()}.txt`);
  fs.writeFileSync(tmpSeedFile, cleanUrls.join('\n') + '\n', 'utf-8');

  const jobId = `job-${Date.now()}`;
  currentJob = {
    id: jobId,
    type: 'crawl',
    status: 'running',
    startedAt: new Date().toISOString(),
    exitCode: null,
    logs: [`Starting crawl with ${cleanUrls.length} URLs...`],
  };

  const proc = spawn('python3', ['main.py', '--urls', path.basename(tmpSeedFile)], {
    cwd: CRAWLER_DIR,
  });

  proc.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text && currentJob) {
      currentJob.logs.push(text);
      if (currentJob.logs.length > 300) currentJob.logs.shift();
    }
  });

  proc.stderr.on('data', (d) => {
    const text = d.toString().trim();
    if (text && currentJob) {
      currentJob.logs.push(`[STDERR] ${text}`);
      if (currentJob.logs.length > 300) currentJob.logs.shift();
    }
  });

  proc.on('close', (code) => {
    if (currentJob) {
      currentJob.exitCode = code;
      currentJob.status = code === 0 ? 'completed' : 'failed';
      currentJob.logs.push(`Process exited with code ${code}`);
    }
    try {
      if (fs.existsSync(tmpSeedFile)) fs.unlinkSync(tmpSeedFile);
    } catch (_) {}
  });

  res.json({ ok: true, jobId, message: 'Crawl initiated' });
});

app.post('/api/resume', (req: Request, res: Response) => {
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: 'A crawl job is already in progress' });
  }

  const { runId } = req.body;
  if (!runId) {
    return res.status(400).json({ error: 'runId is required' });
  }

  const jobId = `resume-${runId}`;
  currentJob = {
    id: jobId,
    type: 'resume',
    status: 'running',
    startedAt: new Date().toISOString(),
    exitCode: null,
    logs: [`Resuming run ${runId}...`],
  };

  const proc = spawn('python3', ['main.py', '--resume', runId], {
    cwd: CRAWLER_DIR,
  });

  proc.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text && currentJob) {
      currentJob.logs.push(text);
      if (currentJob.logs.length > 300) currentJob.logs.shift();
    }
  });

  proc.stderr.on('data', (d) => {
    const text = d.toString().trim();
    if (text && currentJob) {
      currentJob.logs.push(`[STDERR] ${text}`);
      if (currentJob.logs.length > 300) currentJob.logs.shift();
    }
  });

  proc.on('close', (code) => {
    if (currentJob) {
      currentJob.exitCode = code;
      currentJob.status = code === 0 ? 'completed' : 'failed';
      currentJob.logs.push(`Resume completed with exit code ${code}`);
    }
  });

  res.json({ ok: true, jobId, message: `Resume for run ${runId} initiated` });
});

app.post('/api/tests/run', async (req: Request, res: Response) => {
  try {
    const data = await runPythonBridge(['run-tests']);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Guard: Undefined /api routes must return 404 JSON, never falling through to Vite HTML
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
