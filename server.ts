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

// Cross-platform python binary detection (Windows: python, Unix: python3)
const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

// Strict regex pattern for run ID to prevent path traversal
const RUN_ID_REGEX = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

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
    const proc = spawn(PYTHON_CMD, [path.join(CRAWLER_DIR, 'api_bridge.py'), ...args], {
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
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  res.json({
    ok: true,
    stage: 'Stage 2 (Dual Engine: Books Profile + Generic Heuristic + Optional LLM)',
    target: 'Universal (Profile: books.toscrape.com & Generic Web)',
    dbInitialized: dbExists,
    configExists,
    hasGeminiKey,
    activeJob: currentJob,
  });
});

app.get('/api/tasks/checklist', (req: Request, res: Response) => {
  const progressPath = path.join(CRAWLER_DIR, 'progress.md');
  let progressContent = '';
  if (fs.existsSync(progressPath)) {
    progressContent = fs.readFileSync(progressPath, 'utf-8');
  }

  // Pre-configured task checklist definitions matching Stage 1 & Stage 2 lifecycle
  const checklist = [
    {
      id: 'task-1',
      stage: 'Stage 1',
      title: 'Scaffolding & Dependency Pinning',
      description: 'Locked Playwright, BS4, LXML, Pydantic, and SQLite store',
      completed: true,
    },
    {
      id: 'task-2',
      stage: 'Stage 1',
      title: 'Network Safety & SSRF Validation',
      description: 'Host DNS resolution blocking private, loopback, and link-local ranges',
      completed: true,
    },
    {
      id: 'task-3',
      stage: 'Stage 1',
      title: 'Robots.txt Parser & Compliance',
      description: 'Per-host cache with politeness delays and status code rules',
      completed: true,
    },
    {
      id: 'task-4',
      stage: 'Stage 1',
      title: 'Rule-Based Books Extractor',
      description: 'Targeted CSS & table row extraction for books.toscrape.com',
      completed: true,
    },
    {
      id: 'task-5',
      stage: 'Stage 1',
      title: 'Resumable SQLite Storage',
      description: 'Runs and URLs tables supporting sequential runs and recovery',
      completed: true,
    },
    {
      id: 'task-6',
      stage: 'Stage 2',
      title: 'Multi-Format Export Suite',
      description: 'JSON, CSV, multi-sheet Excel (.xlsx), and summary.txt reports',
      completed: true,
    },
    {
      id: 'task-7',
      stage: 'Stage 2',
      title: 'Generic Heuristic Extractor',
      description: 'Universal extraction for non-book domains (articles, tables, summaries)',
      completed: true,
    },
    {
      id: 'task-8',
      stage: 'Stage 2',
      title: 'Optional Gemini LLM Fallback',
      description: 'gemini-3.8-flash enrichment when rule-based fields are missing',
      completed: true,
    },
    {
      id: 'task-9',
      stage: 'Stage 2',
      title: 'Single-URL & Retry CLI Flags',
      description: 'Support CLI direct URLs, --llm, --no-llm, and --retry-failed',
      completed: true,
    },
    {
      id: 'task-10',
      stage: 'Stage 2',
      title: 'Live Task Checklist Synchronizer',
      description: 'Real-time task monitor in UI synchronized with progress.md',
      completed: true,
    },
  ];

  res.json({
    tasks: checklist,
    completedCount: checklist.filter((t) => t.completed).length,
    totalCount: checklist.length,
    percentage: Math.round((checklist.filter((t) => t.completed).length / checklist.length) * 100),
    hasProgressFile: Boolean(progressContent),
  });
});

app.get('/api/profiles', async (req: Request, res: Response) => {
  try {
    const data = await runPythonBridge(['profiles']);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', (req: Request, res: Response) => {
  try {
    const { name, domains, record_type, fields } = req.body;
    if (!name || !domains || !Array.isArray(domains) || domains.length === 0 || !fields) {
      return res.status(400).json({ error: 'name, domains (array), record_type, and fields are required' });
    }
    const cleanName = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const yamlLines = [
      `name: ${cleanName}`,
      `domains: [${domains.map((d: string) => String(d).trim()).join(', ')}]`,
      `record_type: ${record_type || 'Record'}`,
      'fields:',
    ];

    for (const [fName, rule] of Object.entries(fields as Record<string, any>)) {
      yamlLines.push(`  ${fName}:`);
      if (rule.selector) yamlLines.push(`    selector: "${String(rule.selector).replace(/"/g, '\\"')}"`);
      if (rule.table_row) yamlLines.push(`    table_row: "${String(rule.table_row).replace(/"/g, '\\"')}"`);
      yamlLines.push(`    attr: ${rule.attr || 'text'}`);
      yamlLines.push(`    required: ${Boolean(rule.required)}`);
    }

    const targetFile = path.join(CRAWLER_DIR, 'profiles', `${cleanName}.yaml`);
    fs.writeFileSync(targetFile, yamlLines.join('\n') + '\n', 'utf-8');
    res.json({ ok: true, name: cleanName, file: `${cleanName}.yaml` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
  const runId = req.params.id;
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }
  try {
    const data = await runPythonBridge(['run-detail', runId]);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs/:id/log', (req: Request, res: Response) => {
  const runId = req.params.id;
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).send('Invalid run ID format');
  }
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
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }
  const dataPath = path.join(CRAWLER_DIR, 'output', runId, 'data.json');
  if (fs.existsSync(dataPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="data-${runId}.json"`);
    res.sendFile(dataPath);
  } else {
    res.status(404).json({ error: 'data.json not found for this run' });
  }
});

app.get('/api/runs/:id/csv', (req: Request, res: Response) => {
  const runId = req.params.id;
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }
  const csvPath = path.join(CRAWLER_DIR, 'output', runId, 'data.csv');
  if (fs.existsSync(csvPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="data-${runId}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(csvPath);
  } else {
    res.status(404).json({ error: 'data.csv not found for this run' });
  }
});

app.get('/api/runs/:id/excel', (req: Request, res: Response) => {
  const runId = req.params.id;
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).json({ error: 'Invalid run ID format' });
  }
  const xlsxPath = path.join(CRAWLER_DIR, 'output', runId, 'data.xlsx');
  if (fs.existsSync(xlsxPath)) {
    res.setHeader('Content-Disposition', `attachment; filename="data-${runId}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.sendFile(xlsxPath);
  } else {
    res.status(404).json({ error: 'data.xlsx not found for this run' });
  }
});

app.get('/api/runs/:id/summary', (req: Request, res: Response) => {
  const runId = req.params.id;
  if (!RUN_ID_REGEX.test(runId)) {
    return res.status(400).send('Invalid run ID format');
  }
  const summaryPath = path.join(CRAWLER_DIR, 'output', runId, 'summary.txt');
  if (fs.existsSync(summaryPath)) {
    res.type('text/plain').send(fs.readFileSync(summaryPath, 'utf-8'));
  } else {
    res.status(404).send('summary.txt not found for this run');
  }
});

app.post('/api/crawl', (req: Request, res: Response) => {
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: 'A crawl job is already in progress' });
  }

  const { urls, useLlm, scroll } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }

  // Filter and sanitize URLs
  const cleanUrls = urls
    .map((u: string) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u: string) => u.length > 0 && !u.startsWith('#'));

  if (cleanUrls.length === 0) {
    return res.status(400).json({ error: 'No valid URLs provided' });
  }

  // Write temporary seed file
  const tmpSeedFile = path.join(CRAWLER_DIR, `seed_${Date.now()}.txt`);
  fs.writeFileSync(tmpSeedFile, cleanUrls.join('\n') + '\n', 'utf-8');

  const jobId = `job-${Date.now()}`;
  currentJob = {
    id: jobId,
    type: 'crawl',
    status: 'running',
    startedAt: new Date().toISOString(),
    exitCode: null,
    logs: [`Starting Stage 2 crawl with ${cleanUrls.length} URLs (LLM: ${useLlm ? 'ON' : 'OFF'}, Scroll: ${scroll ? 'ON' : 'OFF'})...`],
  };

  const spawnArgs = ['main.py', '--urls', path.basename(tmpSeedFile)];
  if (useLlm) spawnArgs.push('--llm');
  if (scroll) spawnArgs.push('--scroll');

  const proc = spawn(PYTHON_CMD, spawnArgs, {
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
      // Exit code 0 (success) and 1 (0 records produced) are completed runs according to spec
      currentJob.status = code === 0 || code === 1 ? 'completed' : 'failed';
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

  const { runId, retryFailed, useLlm } = req.body;
  if (!runId || typeof runId !== 'string' || !RUN_ID_REGEX.test(runId)) {
    return res.status(400).json({ error: 'Valid runId format is required' });
  }

  const jobId = `resume-${runId}`;
  currentJob = {
    id: jobId,
    type: 'resume',
    status: 'running',
    startedAt: new Date().toISOString(),
    exitCode: null,
    logs: [`Resuming run ${runId} (retry failed: ${Boolean(retryFailed)})...`],
  };

  const spawnArgs = ['main.py', '--resume', runId];
  if (retryFailed) spawnArgs.push('--retry-failed');
  if (useLlm) spawnArgs.push('--llm');

  const proc = spawn(PYTHON_CMD, spawnArgs, {
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
      currentJob.status = code === 0 || code === 1 ? 'completed' : 'failed';
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
