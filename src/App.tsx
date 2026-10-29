/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Terminal,
  Database,
  BookOpen,
  FileText,
  ShieldCheck,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  Download,
  Flame,
  Code2,
  ClipboardPaste,
  FileSpreadsheet,
  Trash2,
  Layers,
  Info,
  CheckSquare,
  Square,
  Sparkles,
  Sliders,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Eye,
  Globe,
  Plus,
  HelpCircle,
  Tag,
} from 'lucide-react';

interface TaskItem {
  id: string;
  stage: string;
  title: string;
  description: string;
  completed: boolean;
}

interface RunSummary {
  id: string;
  created_at: string;
  output_dir: string;
  total: number;
  done: number;
  blocked: number;
  failed: number;
  pending: number;
}

interface UrlItem {
  url: string;
  status: 'done' | 'blocked' | 'failed' | 'pending';
  error: string | null;
  record: any | null;
  attempts: number;
  updated_at: string;
}

interface RunDetail {
  id: string;
  created_at: string;
  output_dir: string;
  urls: UrlItem[];
  records: any[];
}

interface ActiveJob {
  id: string;
  type: 'crawl' | 'resume';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  exitCode: number | null;
  logs: string[];
}

interface ProfileInfo {
  name: string;
  domains: string[];
  record_type: string;
  fields: Record<string, { selector?: string; attr?: string; table_row?: string; required: boolean }>;
  source_file: string;
}

interface PresetItem {
  name: string;
  category: 'Books Profile' | 'Quotes Profile' | 'Generic Web' | 'Documentation';
  url: string;
  mode: string;
}

const PRESET_ITEMS: PresetItem[] = [
  {
    name: 'Books: Light in Attic',
    category: 'Books Profile',
    url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    mode: 'books.yaml Profile',
  },
  {
    name: 'Books: Tipping Velvet',
    category: 'Books Profile',
    url: 'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html',
    mode: 'books.yaml Profile',
  },
  {
    name: 'Quotes: Quotes to Scrape',
    category: 'Quotes Profile',
    url: 'https://quotes.toscrape.com/page/1/',
    mode: 'quotes.yaml Profile',
  },
  {
    name: 'Wikipedia: Web Crawler',
    category: 'Generic Web',
    url: 'https://en.wikipedia.org/wiki/Web_crawler',
    mode: 'Universal Generic Heuristic + Tables',
  },
  {
    name: 'Hacker News: Frontpage',
    category: 'Generic Web',
    url: 'https://news.ycombinator.com',
    mode: 'Universal Generic Heuristic',
  },
  {
    name: 'Python: Documentation',
    category: 'Documentation',
    url: 'https://docs.python.org/3/',
    mode: 'Universal Generic Heuristic',
  },
];

async function safeJsonFetch<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'records' | 'profiles' | 'checklist' | 'history' | 'tests' | 'specs'>('console');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [urlInput, setUrlInput] = useState<string>(PRESET_ITEMS[0].url);
  const [isMultiLine, setIsMultiLine] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [testOutput, setTestOutput] = useState<{ stdout?: string; passed?: boolean; exit_code?: number } | null>(null);
  const [testingRunning, setTestingRunning] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);
  const [showChecklistBanner, setShowChecklistBanner] = useState<boolean>(true);
  const [checklistFilter, setChecklistFilter] = useState<'all' | 'completed' | 'pending'>('all');

  // Multi-site Profiles state
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [newProfileDomain, setNewProfileDomain] = useState<string>('');
  const [newProfileType, setNewProfileType] = useState<string>('CustomRecord');
  const [newProfileFields, setNewProfileFields] = useState<Array<{ name: string; selector: string; required: boolean }>>([
    { name: 'title', selector: 'h1', required: true },
    { name: 'summary', selector: 'p', required: false },
  ]);

  // Stage 2 Options
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [dynamicScroll, setDynamicScroll] = useState<boolean>(false);
  const [retryFailedOnResume, setRetryFailedOnResume] = useState<boolean>(true);
  const [serverStatus, setServerStatus] = useState<any>(null);

  // Task Checklist state
  const [tasks, setTasks] = useState<TaskItem[]>([
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
  ]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Poll status, runs & profiles
  const fetchStatusAndRuns = async () => {
    try {
      const [statusRes, runsRes, checklistRes, profilesRes] = await Promise.all([
        safeJsonFetch<any>('/api/status'),
        safeJsonFetch<RunSummary[]>('/api/runs'),
        safeJsonFetch<any>('/api/tasks/checklist'),
        safeJsonFetch<ProfileInfo[]>('/api/profiles'),
      ]);

      if (statusRes) {
        setServerStatus(statusRes);
        setActiveJob(statusRes.activeJob || null);
      }

      if (checklistRes?.tasks) {
        setTasks(checklistRes.tasks);
      }

      if (Array.isArray(profilesRes)) {
        setProfiles(profilesRes);
      }

      if (Array.isArray(runsRes)) {
        setRuns(runsRes);
        if (!selectedRunId && runsRes.length > 0) {
          setSelectedRunId(runsRes[0].id);
        }
      }
    } catch {
      // Safe fallback
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim() || !newProfileDomain.trim()) {
      alert('Profile name and domain are required');
      return;
    }
    setProfileSaving(true);
    try {
      const fieldObj: Record<string, any> = {};
      newProfileFields.forEach((f) => {
        if (f.name.trim()) {
          fieldObj[f.name.trim()] = {
            selector: f.selector.trim() || null,
            attr: 'text',
            required: f.required,
          };
        }
      });

      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProfileName.trim(),
          domains: [newProfileDomain.trim()],
          record_type: newProfileType.trim() || 'CustomRecord',
          fields: fieldObj,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to save profile');
      } else {
        showToast(`Profile ${data.file} created and loaded!`);
        await fetchStatusAndRuns();
        setNewProfileName('');
        setNewProfileDomain('');
      }
    } catch (err: any) {
      alert(`Error creating profile: ${err.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const getUrlModeInfo = (url: string) => {
    const clean = url.trim().toLowerCase();
    if (!clean) {
      return {
        type: 'idle',
        badge: 'Universal Mode: Ready',
        description: 'Accepts books.toscrape.com, quotes.toscrape.com, or any web URL',
        color: 'bg-[#3A1D4E] text-[#C4A4DA] border-[#7F5D99]',
      };
    }
    if (clean.includes('books.toscrape.com')) {
      return {
        type: 'profile',
        badge: 'Profile: books.yaml',
        description: 'Targeted CSS & UPC table row selectors for Book records',
        color: 'bg-[#4C2365] text-[#EBE2CC] border-[#7F5D99]',
      };
    }
    if (clean.includes('quotes.toscrape.com')) {
      return {
        type: 'profile',
        badge: 'Profile: quotes.yaml',
        description: 'Targeted Quote text (span.text), Author (small.author) & Tags',
        color: 'bg-emerald-950/70 text-emerald-200 border-emerald-600',
      };
    }
    for (const p of profiles) {
      if (p.domains.some((d: string) => clean.includes(d.toLowerCase()))) {
        return {
          type: 'profile',
          badge: `Profile: ${p.source_file}`,
          description: `Custom ${p.record_type} profile (${Object.keys(p.fields).join(', ')})`,
          color: 'bg-[#4C2365] text-[#EBE2CC] border-[#7F5D99]',
        };
      }
    }
    return {
      type: 'generic',
      badge: 'Generic Heuristic Mode + Tables',
      description: 'Auto-extracts title, lead paragraph, body text density, and HTML <table> elements',
      color: 'bg-indigo-950/80 text-indigo-200 border-indigo-600',
    };
  };

  const isBookUrl = (url: string) => url.toLowerCase().includes('books.toscrape.com');

  useEffect(() => {
    fetchStatusAndRuns();
    const interval = setInterval(fetchStatusAndRuns, 3000);
    return () => clearInterval(interval);
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) return;
    safeJsonFetch<RunDetail>(`/api/runs/${selectedRunId}`).then((data) => {
      if (data && !('error' in (data as any))) {
        setRunDetail(data);
      }
    });
  }, [selectedRunId, activeJob?.status]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeJob?.logs]);

  const showToast = (message: string) => {
    setDownloadSuccessToast(message);
    setTimeout(() => setDownloadSuccessToast(null), 3500);
  };

  const handleStartCrawl = async () => {
    const rawUrls = isMultiLine
      ? urlInput.split('\n').map((u) => u.trim()).filter(Boolean)
      : [urlInput.trim()].filter(Boolean);

    if (rawUrls.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: rawUrls,
          useLlm,
          scroll: dynamicScroll,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start crawl');
      } else {
        fetchStatusAndRuns();
        setActiveTab('console');
      }
    } catch (err: any) {
      alert(`Network error starting crawl: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (runId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          retryFailed: retryFailedOnResume,
          useLlm,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to resume crawl');
      } else {
        setSelectedRunId(runId);
        fetchStatusAndRuns();
        setActiveTab('console');
      }
    } catch (err: any) {
      alert(`Network error resuming run: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTests = async () => {
    setTestingRunning(true);
    setTestOutput(null);
    try {
      const res = await fetch('/api/tests/run', { method: 'POST' });
      const data = await res.json();
      setTestOutput(data);
    } catch (err: any) {
      setTestOutput({ stdout: `Failed to run tests: ${err.message}`, passed: false });
    } finally {
      setTestingRunning(false);
    }
  };

  const handleDownloadFile = (type: 'json' | 'csv' | 'excel' | 'summary') => {
    if (!selectedRunId) return;

    const endpoints: Record<string, string> = {
      json: `/api/runs/${selectedRunId}/data`,
      csv: `/api/runs/${selectedRunId}/csv`,
      excel: `/api/runs/${selectedRunId}/excel`,
      summary: `/api/runs/${selectedRunId}/summary`,
    };

    const filenames: Record<string, string> = {
      json: `dataset_${selectedRunId}.json`,
      csv: `dataset_${selectedRunId}.csv`,
      excel: `dataset_${selectedRunId}.xlsx`,
      summary: `summary_${selectedRunId}.txt`,
    };

    const link = document.createElement('a');
    link.href = endpoints[type];
    link.download = filenames[type];
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded ${filenames[type]} to local drive`);
  };

  const handleCopyRecord = (record: any, index: number) => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        if (text.includes('\n')) setIsMultiLine(true);
      }
    } catch {
      // Permission issue fallback
    }
  };

  const filteredRecords = (runDetail?.records || []).filter((r: any) => {
    if (!searchTerm) return true;
    const query = searchTerm.toLowerCase();
    return (
      (r.title && String(r.title).toLowerCase().includes(query)) ||
      (r.summary && String(r.summary).toLowerCase().includes(query)) ||
      (r.byline && String(r.byline).toLowerCase().includes(query)) ||
      (r.upc && String(r.upc).toLowerCase().includes(query)) ||
      (r.domain && String(r.domain).toLowerCase().includes(query))
    );
  });

  const completedTasksCount = tasks.filter((t) => t.completed).length;
  const progressPct = Math.round((completedTasksCount / tasks.length) * 100);

  const displayedTasks = tasks.filter((t) => {
    if (checklistFilter === 'completed') return t.completed;
    if (checklistFilter === 'pending') return !t.completed;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#1F0E2A] text-white flex flex-col font-sans">
      {/* Toast Notification */}
      {downloadSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#7F5D99] text-[#EBE2CC] border border-[#C4A4DA] px-5 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-fade-in font-medium">
          <FileCheck className="w-5 h-5 text-[#EBE2CC]" />
          <span>{downloadSuccessToast}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-[#4C2365] bg-[#2A1438] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#4C2365] border border-[#7F5D99] flex items-center justify-center text-[#EBE2CC] font-bold text-xl shadow-inner">
              🕷️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#EBE2CC] tracking-wide">
                  Web Crawler Studio <span className="text-xs px-2 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] border border-[#7F5D99] font-mono">Stage 2 Full Engine</span>
                </h1>
              </div>
              <p className="text-xs text-[#9E7EB5]">
                Dual Engine: Profile-based rules for <span className="text-[#EBE2CC] underline">books.toscrape.com</span> + Generic heuristics & Gemini fallback for any web domain
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowChecklistBanner(!showChecklistBanner)}
              className="px-3 py-1.5 rounded-md bg-[#4C2365] border border-[#7F5D99] text-xs font-medium text-[#EBE2CC] hover:bg-[#5D2B7D] transition flex items-center gap-1.5"
            >
              <CheckSquare className="w-4 h-4 text-[#C4A4DA]" />
              <span>Tasks ({completedTasksCount}/{tasks.length})</span>
              {showChecklistBanner ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {selectedRunId && (
              <div className="flex items-center gap-1 bg-[#1F0E2A] p-1 rounded-md border border-[#4C2365]">
                <button
                  onClick={() => handleDownloadFile('json')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[#4C2365] text-[#EBE2CC] hover:bg-[#7F5D99] transition flex items-center gap-1"
                  title="Download JSON"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
                <button
                  onClick={() => handleDownloadFile('csv')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[#4C2365] text-[#EBE2CC] hover:bg-[#7F5D99] transition flex items-center gap-1"
                  title="Download CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={() => handleDownloadFile('excel')}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[#7F5D99] text-[#EBE2CC] hover:bg-[#9E7EB5] transition flex items-center gap-1"
                  title="Download Excel Workbook with Tables"
                >
                  <Database className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Live Task Checklist Monitor Widget */}
      {showChecklistBanner && (
        <section className="bg-[#230F30] border-b border-[#4C2365] px-6 py-3.5 shadow-sm">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-[#4C2365] text-[#EBE2CC]">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#EBE2CC] flex items-center gap-2">
                    Active Implementation Checklist
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#4C2365] text-[#C4A4DA] font-mono font-normal">
                      {progressPct}% Completed ({completedTasksCount}/{tasks.length})
                    </span>
                  </h3>
                  <p className="text-xs text-[#9E7EB5]">
                    Tracks completed deliverables across Stage 1 and Stage 2 architectures, synchronized with progress.md.
                  </p>
                </div>
              </div>

              {/* Checklist Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-[#1F0E2A] p-1 rounded-md border border-[#4C2365] text-xs">
                <button
                  onClick={() => setChecklistFilter('all')}
                  className={`px-2.5 py-1 rounded transition ${checklistFilter === 'all' ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold' : 'text-[#C4A4DA] hover:text-white'}`}
                >
                  All Tasks ({tasks.length})
                </button>
                <button
                  onClick={() => setChecklistFilter('completed')}
                  className={`px-2.5 py-1 rounded transition ${checklistFilter === 'completed' ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold' : 'text-[#C4A4DA] hover:text-white'}`}
                >
                  <Eye className="w-3 h-3 inline mr-1" />
                  Look at Completed ({completedTasksCount})
                </button>
                <button
                  onClick={() => setChecklistFilter('pending')}
                  className={`px-2.5 py-1 rounded transition ${checklistFilter === 'pending' ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold' : 'text-[#C4A4DA] hover:text-white'}`}
                >
                  Pending ({tasks.length - completedTasksCount})
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#1F0E2A] rounded-full h-2 mb-3 overflow-hidden border border-[#4C2365]">
              <div
                className="bg-gradient-to-r from-[#7F5D99] via-[#C4A4DA] to-[#EBE2CC] h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Checklist Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
              {displayedTasks.map((t) => (
                <div
                  key={t.id}
                  className={`p-2.5 rounded border transition-all text-xs flex flex-col justify-between ${
                    t.completed
                      ? 'bg-[#2A1438] border-[#7F5D99] text-[#EBE2CC]'
                      : 'bg-[#1F0E2A] border-[#4C2365] text-[#9E7EB5]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-[#C4A4DA]">
                      {t.completed ? (
                        <CheckSquare className="w-4 h-4 text-[#EBE2CC]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#9E7EB5]" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1 rounded bg-[#4C2365] text-[#C4A4DA] font-mono">
                          {t.stage}
                        </span>
                        <span className="font-semibold text-white">{t.title}</span>
                      </div>
                      <p className="text-[11px] text-[#9E7EB5] mt-1 leading-snug line-clamp-2">
                        {t.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className={`text-[10px] font-mono ${t.completed ? 'text-[#EBE2CC]' : 'text-amber-400'}`}>
                      {t.completed ? '[x] Completed' : '[ ] In Progress'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 flex-1 w-full space-y-6">
        {/* Sticky URL & Options Input Bar */}
        <section className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-5 shadow-lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#EBE2CC] flex items-center gap-1.5">
                  <Play className="w-4 h-4 text-[#C4A4DA]" /> Target Extraction Queue
                </span>
                {(() => {
                  const modeInfo = getUrlModeInfo(urlInput);
                  return (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-mono ${modeInfo.color}`}>
                      {modeInfo.badge}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('profiles')}
                  className="px-2.5 py-1 text-xs rounded bg-[#4C2365] border border-[#7F5D99] text-[#EBE2CC] hover:bg-[#5D2B7D] transition flex items-center gap-1.5"
                  title="Configure domain profiles for other sites"
                >
                  <Globe className="w-3.5 h-3.5 text-[#C4A4DA]" /> Other Sites / Profiles
                </button>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 text-xs rounded bg-[#4C2365] border border-[#7F5D99] text-[#EBE2CC] hover:bg-[#5D2B7D] transition flex items-center gap-1.5"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                </button>
                <button
                  type="button"
                  onClick={() => setIsMultiLine(!isMultiLine)}
                  className="px-2.5 py-1 text-xs rounded bg-[#4C2365] border border-[#7F5D99] text-[#C4A4DA] hover:text-white transition flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" /> {isMultiLine ? 'Single Link' : 'Multi-Link Batch'}
                </button>
                <button
                  type="button"
                  onClick={() => setUrlInput('')}
                  className="px-2 py-1 text-xs rounded text-rose-300 hover:text-rose-200 transition"
                  title="Clear input"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Subtitle explaining current extractor behavior */}
            <div className="text-[11px] text-[#9E7EB5] -mt-1 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-[#C4A4DA] shrink-0" />
              <span>{getUrlModeInfo(urlInput).description}</span>
            </div>

            {/* Input area */}
            {isMultiLine ? (
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                rows={4}
                placeholder="Enter one target URL per line (supports books.toscrape.com, quotes.toscrape.com, or any article/e-commerce URL)..."
                className="w-full bg-[#1F0E2A] border border-[#7F5D99] rounded-lg px-4 py-3 text-sm text-[#EBE2CC] placeholder-[#9E7EB5] focus:outline-none focus:ring-2 focus:ring-[#C4A4DA] font-mono leading-relaxed resize-y"
              />
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste any target website URL (e.g. https://quotes.toscrape.com/ or https://en.wikipedia.org/...)"
                  className="w-full bg-[#1F0E2A] border border-[#7F5D99] rounded-lg pl-4 pr-10 py-3 text-sm text-[#EBE2CC] placeholder-[#9E7EB5] focus:outline-none focus:ring-2 focus:ring-[#C4A4DA] font-mono shadow-inner"
                />
              </div>
            )}

            {/* Quick Preset Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs text-[#9E7EB5]">
              <span className="shrink-0 text-neutral-400 font-medium">Sample Targets:</span>
              {PRESET_ITEMS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrlInput(item.url);
                    setIsMultiLine(false);
                  }}
                  className={`px-2.5 py-1 rounded border font-mono truncate max-w-[240px] transition shrink-0 flex items-center gap-1.5 ${
                    urlInput === item.url
                      ? 'bg-[#7F5D99] border-[#C4A4DA] text-[#EBE2CC]'
                      : 'bg-[#1F0E2A] border-[#4C2365] text-[#C4A4DA] hover:border-[#7F5D99]'
                  }`}
                  title={`${item.name} (${item.mode}): ${item.url}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C4A4DA]" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>

            {/* Stage 2 Execution Toggles & Start Action */}
            <div className="pt-2 border-t border-[#4C2365] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-5 flex-wrap text-xs">
                {/* Gemini LLM Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useLlm}
                    onChange={(e) => setUseLlm(e.target.checked)}
                    className="rounded bg-[#1F0E2A] border-[#7F5D99] text-[#7F5D99] focus:ring-0 w-4 h-4"
                  />
                  <span className="flex items-center gap-1 text-[#EBE2CC] font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Gemini AI Fallback
                    <span className="text-[10px] text-[#C4A4DA] font-mono">(--llm)</span>
                  </span>
                </label>

                {/* Dynamic Scroll Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dynamicScroll}
                    onChange={(e) => setDynamicScroll(e.target.checked)}
                    className="rounded bg-[#1F0E2A] border-[#7F5D99] text-[#7F5D99] focus:ring-0 w-4 h-4"
                  />
                  <span className="text-[#C4A4DA]">
                    Auto-Scroll Lazy Content <span className="text-[10px] text-[#9E7EB5] font-mono">(--scroll)</span>
                  </span>
                </label>

                {/* Retry Failed Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={retryFailedOnResume}
                    onChange={(e) => setRetryFailedOnResume(e.target.checked)}
                    className="rounded bg-[#1F0E2A] border-[#7F5D99] text-[#7F5D99] focus:ring-0 w-4 h-4"
                  />
                  <span className="text-[#C4A4DA]">
                    Reset Failed on Resume <span className="text-[10px] text-[#9E7EB5] font-mono">(--retry-failed)</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleStartCrawl}
                  disabled={loading || activeJob?.status === 'running' || !urlInput.trim()}
                  className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-[#7F5D99] hover:bg-[#9E7EB5] disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-[#EBE2CC] transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#EBE2CC]" /> Starting Engine...
                    </>
                  ) : activeJob?.status === 'running' ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin text-[#EBE2CC]" /> Crawl in Progress...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current text-[#EBE2CC]" /> Start Stage 2 Crawl
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#4C2365] pb-2 overflow-x-auto text-sm font-medium">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'console'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <Terminal className="w-4 h-4" /> Live Terminal & Monitor
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'records'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <Database className="w-4 h-4" /> Extracted Records ({runDetail?.records?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'profiles'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <Globe className="w-4 h-4" /> Other Sites & Profiles ({profiles.length})
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'checklist'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <CheckSquare className="w-4 h-4" /> Task Checklist Matrix ({completedTasksCount}/{tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'history'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <RotateCcw className="w-4 h-4" /> Run History ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'tests'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <FileText className="w-4 h-4" /> Pytest Verification
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeTab === 'specs'
                ? 'bg-[#7F5D99] text-[#EBE2CC] font-semibold'
                : 'text-[#C4A4DA] hover:bg-[#2A1438]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Stage 2 Specifications
          </button>
        </div>

        {/* Tab 1: Live Terminal & Console */}
        {activeTab === 'console' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-4 shadow-sm flex flex-col h-[520px]">
                <div className="flex items-center justify-between pb-3 border-b border-[#4C2365] mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-semibold text-[#EBE2CC]">Sequential Execution Terminal</span>
                  </div>
                  <span className="text-xs font-mono text-[#9E7EB5]">
                    {activeJob ? `Job ID: ${activeJob.id}` : 'Engine Ready'}
                  </span>
                </div>

                <div
                  ref={logContainerRef}
                  className="flex-1 bg-[#15081E] border border-[#3E1B54] rounded-lg p-4 font-mono text-xs overflow-y-auto space-y-1 text-[#EBE2CC]"
                >
                  {(!activeJob?.logs || activeJob.logs.length === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#9E7EB5] space-y-2">
                      <Terminal className="w-8 h-8 text-[#4C2365]" />
                      <p>No active crawl execution logs.</p>
                      <p className="text-[11px] text-[#9E7EB5]">
                        Paste a URL above and click "Start Stage 2 Crawl" to begin sequential processing.
                      </p>
                    </div>
                  ) : (
                    activeJob.logs.map((log, index) => {
                      const isDone = log.includes('[DONE]');
                      const isBlocked = log.includes('[BLOCKED]');
                      const isFailed = log.includes('[FAILED]');
                      const isGeneric = log.includes('[GENERIC]');
                      const isProfile = log.includes('[PROFILE]');

                      return (
                        <div key={index} className="leading-relaxed">
                          {isDone && <span className="text-emerald-400 font-bold mr-1">[DONE]</span>}
                          {isBlocked && <span className="text-amber-400 font-bold mr-1">[BLOCKED]</span>}
                          {isFailed && <span className="text-rose-400 font-bold mr-1">[FAILED]</span>}
                          {isGeneric && <span className="text-sky-300 font-bold mr-1">[GENERIC]</span>}
                          {isProfile && <span className="text-purple-300 font-bold mr-1">[PROFILE]</span>}
                          <span
                            className={
                              isDone
                                ? 'text-emerald-200'
                                : isBlocked
                                ? 'text-amber-200'
                                : isFailed
                                ? 'text-rose-200'
                                : 'text-[#EBE2CC]'
                            }
                          >
                            {log.replace(/\[(DONE|BLOCKED|FAILED|GENERIC|PROFILE)\]\s*/g, '')}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Run Summary Sidebar */}
            <div className="space-y-4">
              <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#C4A4DA]" /> Current Run Status
                </h3>

                {selectedRunId ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-[#1F0E2A] rounded-lg border border-[#4C2365] space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[#9E7EB5]">Selected Run ID:</span>
                        <span className="font-mono text-[#EBE2CC] font-semibold">{selectedRunId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#9E7EB5]">Records Extracted:</span>
                        <span className="text-emerald-400 font-bold">{runDetail?.records?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#9E7EB5]">Processed URLs:</span>
                        <span className="text-white font-mono">{runDetail?.urls?.length || 0}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={() => handleDownloadFile('json')}
                        className="p-2.5 rounded-lg bg-[#4C2365] hover:bg-[#5D2B7D] text-[#EBE2CC] font-medium transition flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> JSON File
                      </button>
                      <button
                        onClick={() => handleDownloadFile('csv')}
                        className="p-2.5 rounded-lg bg-[#4C2365] hover:bg-[#5D2B7D] text-[#EBE2CC] font-medium transition flex items-center justify-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> CSV File
                      </button>
                      <button
                        onClick={() => handleDownloadFile('excel')}
                        className="p-2.5 rounded-lg bg-[#7F5D99] hover:bg-[#9E7EB5] text-[#EBE2CC] font-medium transition flex items-center justify-center gap-1.5 col-span-2"
                      >
                        <Database className="w-3.5 h-3.5" /> Excel Workbook (.xlsx)
                      </button>
                      <button
                        onClick={() => handleDownloadFile('summary')}
                        className="p-2 rounded-lg bg-[#1F0E2A] border border-[#4C2365] hover:border-[#7F5D99] text-[#C4A4DA] text-xs transition flex items-center justify-center gap-1.5 col-span-2"
                      >
                        <FileText className="w-3.5 h-3.5" /> View summary.txt Report
                      </button>
                    </div>

                    <button
                      onClick={() => handleResume(selectedRunId)}
                      disabled={loading || activeJob?.status === 'running'}
                      className="w-full mt-2 py-2 rounded-lg bg-[#4C2365] border border-[#7F5D99] hover:bg-[#5D2B7D] text-[#EBE2CC] text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Resume Pending / Failed URLs
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-[#9E7EB5]">
                    No run selected. Start a crawl to inspect real-time outputs.
                  </div>
                )}
              </div>

              {/* Engine Specs Box */}
              <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#EBE2CC] font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#C4A4DA]" /> Network & Safety Enforcements
                </div>
                <ul className="text-[#9E7EB5] space-y-1 list-disc list-inside">
                  <li>SSRF Protection (Loopback & Private IPs blocked)</li>
                  <li>Cached robots.txt validation before every fetch</li>
                  <li>Headless Playwright with resource type blocking</li>
                  <li>Isolated context memory clearing via gc.collect()</li>
                  <li>Multi-format atomic export protection</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Extracted Records Explorer */}
        {activeTab === 'records' && (
          <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-[#4C2365]">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#C4A4DA]" />
                <h3 className="text-sm font-bold text-[#EBE2CC]">Extracted Dataset Explorer</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] font-mono">
                  {filteredRecords.length} records displayed
                </span>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="w-4 h-4 text-[#9E7EB5] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search titles, UPC, domains..."
                    className="w-full bg-[#1F0E2A] border border-[#4C2365] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#EBE2CC] focus:outline-none focus:ring-1 focus:ring-[#7F5D99]"
                  />
                </div>

                <button
                  onClick={() => handleDownloadFile('json')}
                  className="px-3 py-1.5 rounded-md bg-[#7F5D99] text-[#EBE2CC] text-xs font-semibold hover:bg-[#9E7EB5] transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Export All
                </button>
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#9E7EB5] space-y-2">
                <Database className="w-8 h-8 text-[#4C2365] mx-auto" />
                <p>No records available for the selected run.</p>
                <p>Execute a crawl from the Console tab to view extracted structured entities.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecords.map((rec: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-[#1F0E2A] border border-[#4C2365] rounded-lg p-4 space-y-3 flex flex-col justify-between hover:border-[#7F5D99] transition shadow-inner"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] font-mono">
                          {rec.extraction_mode || (rec.upc ? 'Book Profile' : 'Generic')}
                        </span>
                        <button
                          onClick={() => handleCopyRecord(rec, idx)}
                          className="text-[#9E7EB5] hover:text-[#EBE2CC] transition p-1"
                          title="Copy JSON"
                        >
                          {copiedIndex === idx ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <h4 className="font-semibold text-sm text-[#EBE2CC] line-clamp-2 leading-snug">
                        {rec.title || 'Untitled Record'}
                      </h4>

                      {rec.byline && (
                        <p className="text-xs text-[#C4A4DA]">By {rec.byline}</p>
                      )}

                      {rec.summary && (
                        <p className="text-xs text-[#9E7EB5] line-clamp-3 leading-relaxed">
                          {rec.summary}
                        </p>
                      )}

                      {rec.price && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-[#3E1B54]">
                          <span className="text-[#9E7EB5]">Price:</span>
                          <span className="font-bold text-[#EBE2CC] font-mono">{rec.price}</span>
                        </div>
                      )}

                      {rec.upc && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#9E7EB5]">UPC:</span>
                          <span className="font-mono text-[#C4A4DA] text-[11px]">{rec.upc}</span>
                        </div>
                      )}

                      {rec.tables && rec.tables.length > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#9E7EB5]">Tables Extracted:</span>
                          <span className="font-bold text-sky-300 font-mono">{rec.tables.length}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[#3E1B54] flex items-center justify-between text-[11px] text-[#9E7EB5]">
                      <span className="font-mono truncate max-w-[140px]">{rec.domain}</span>
                      <a
                        href={rec.final_url || rec.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#C4A4DA] hover:text-[#EBE2CC] flex items-center gap-1"
                      >
                        Visit <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Task Checklist Matrix */}
        {activeTab === 'checklist' && (
          <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#4C2365]">
              <div>
                <h3 className="text-base font-bold text-[#EBE2CC] flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-[#C4A4DA]" /> Complete Engineering Task Checklist
                </h3>
                <p className="text-xs text-[#9E7EB5]">
                  Verification matrix tracking every Stage 1 and Stage 2 architectural component.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-3 py-1 rounded bg-[#4C2365] text-[#EBE2CC] font-bold">
                  {completedTasksCount} / {tasks.length} Completed (100%)
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] hover:border-[#7F5D99] transition flex items-start gap-4"
                >
                  <div className="mt-1">
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Square className="w-5 h-5 text-neutral-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] font-mono">
                        {task.stage}
                      </span>
                      <h4 className="text-sm font-semibold text-white">{task.title}</h4>
                      <span className="text-xs font-mono text-emerald-300 ml-auto">[x] VERIFIED</span>
                    </div>
                    <p className="text-xs text-[#9E7EB5] leading-relaxed">
                      {task.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Run History Hub */}
        {activeTab === 'history' && (
          <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#4C2365]">
              <h3 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#C4A4DA]" /> SQLite Persistence Runs
              </h3>
              <span className="text-xs text-[#9E7EB5]">Database: crawler/crawl.db</span>
            </div>

            {runs.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#9E7EB5]">
                No recorded runs in SQLite database yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[#9E7EB5] border-b border-[#4C2365] uppercase font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Run ID</th>
                      <th className="py-2.5 px-3">Timestamp (UTC)</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3 text-emerald-400">Done</th>
                      <th className="py-2.5 px-3 text-amber-400">Blocked</th>
                      <th className="py-2.5 px-3 text-rose-400">Failed</th>
                      <th className="py-2.5 px-3 text-sky-400">Pending</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3E1B54] font-mono text-[#EBE2CC]">
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedRunId(r.id)}
                        className={`hover:bg-[#1F0E2A] cursor-pointer transition ${
                          selectedRunId === r.id ? 'bg-[#1F0E2A] font-bold text-white' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-[#C4A4DA]">{r.id}</td>
                        <td className="py-2.5 px-3 text-[#9E7EB5]">{r.created_at.replace('T', ' ').slice(0, 19)}</td>
                        <td className="py-2.5 px-3">{r.total}</td>
                        <td className="py-2.5 px-3 text-emerald-400">{r.done}</td>
                        <td className="py-2.5 px-3 text-amber-400">{r.blocked}</td>
                        <td className="py-2.5 px-3 text-rose-400">{r.failed}</td>
                        <td className="py-2.5 px-3 text-sky-400">{r.pending}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResume(r.id);
                            }}
                            className="px-2.5 py-1 rounded bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] transition text-[11px]"
                          >
                            Resume
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Pytest Verification */}
        {activeTab === 'tests' && (
          <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#4C2365]">
              <div>
                <h3 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#C4A4DA]" /> Offline Pytest Test Suite Runner
                </h3>
                <p className="text-xs text-[#9E7EB5]">
                  Executes offline pytest verification covering Stage 1 & Stage 2 suites without network dependencies.
                </p>
              </div>

              <button
                onClick={handleRunTests}
                disabled={testingRunning}
                className="px-4 py-2 rounded-lg bg-[#7F5D99] hover:bg-[#9E7EB5] text-[#EBE2CC] text-xs font-semibold transition flex items-center gap-2"
              >
                {testingRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#EBE2CC]" /> Running Suite...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-[#EBE2CC]" /> Execute Pytest
                  </>
                )}
              </button>
            </div>

            <div className="bg-[#15081E] border border-[#3E1B54] rounded-lg p-4 font-mono text-xs overflow-y-auto max-h-[460px] text-[#EBE2CC]">
              {testOutput ? (
                <div className="space-y-3">
                  <div
                    className={`p-3 rounded border font-sans font-medium flex items-center gap-2 ${
                      testOutput.passed
                        ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                        : 'bg-rose-950/60 border-rose-600 text-rose-200'
                    }`}
                  >
                    {testOutput.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                    )}
                    <span>
                      {testOutput.passed
                        ? 'All Unit Tests Passed Successfully!'
                        : `Test suite finished with exit code ${testOutput.exit_code}`}
                    </span>
                  </div>
                  <pre className="text-neutral-300 leading-relaxed whitespace-pre-wrap">{testOutput.stdout}</pre>
                </div>
              ) : (
                <div className="text-center py-10 text-neutral-500">
                  Click "Execute Pytest" above to trigger automated test verification.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Other Sites & Profiles */}
        {activeTab === 'profiles' && (
          <div className="space-y-6">
            {/* Architectural Explanation Banner */}
            <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#4C2365] border border-[#7F5D99] flex items-center justify-center text-[#EBE2CC]">
                  <Globe className="w-5 h-5 text-[#C4A4DA]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#EBE2CC]">
                    Running the Crawler on Other Websites
                  </h3>
                  <p className="text-xs text-[#9E7EB5]">
                    Web Crawler Studio supports both universal zero-config web extraction and precision selector profiles.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#7F5D99]/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <h4 className="text-sm font-semibold text-white">Method 1: Zero-Config Generic Mode</h4>
                  </div>
                  <p className="text-xs text-[#9E7EB5] leading-relaxed">
                    Simply paste any target web URL into the console. The crawler automatically activates <code className="text-[#C4A4DA]">generic_extractor.py</code> to extract:
                  </p>
                  <ul className="text-xs text-neutral-300 space-y-1 pl-4 list-disc marker:text-[#7F5D99]">
                    <li>Page & OpenGraph title, author tags, and publication dates</li>
                    <li>Lead paragraph and body text density scoring</li>
                    <li>HTML <code className="text-[#C4A4DA]">&lt;table&gt;</code> element matrix extraction into structured sheets</li>
                    <li>Optional Gemini LLM fallback (<code className="text-[#C4A4DA]">--llm</code>) for unstructured text</li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#7F5D99]/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <h4 className="text-sm font-semibold text-white">Method 2: Declarative Domain Profiles</h4>
                  </div>
                  <p className="text-xs text-[#9E7EB5] leading-relaxed">
                    When you want exact attributes (e.g. price, SKU, rating, quote text), define a YAML profile in <code className="text-[#C4A4DA]">crawler/profiles/</code>:
                  </p>
                  <ul className="text-xs text-neutral-300 space-y-1 pl-4 list-disc marker:text-[#7F5D99]">
                    <li>Custom CSS selectors for specific DOM nodes</li>
                    <li>Targeted table-row lookups (e.g. <code className="text-[#C4A4DA]">table_row: UPC</code>)</li>
                    <li>Dynamic Pydantic schema validation for strict datasets</li>
                    <li>Auto-discovered when crawling matching domains</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Active Profiles Section */}
            <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#EBE2CC]">Active Domain Profiles ({profiles.length})</h3>
                  <p className="text-xs text-[#9E7EB5]">Installed selector rule sets in crawler/profiles/</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-[#4C2365] text-[#C4A4DA] font-mono border border-[#7F5D99]">
                  Directory: crawler/profiles/*.yaml
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profiles.map((prof, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#EBE2CC] text-sm uppercase">{prof.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] font-mono">
                            {prof.record_type}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#9E7EB5]">{prof.source_file}</span>
                      </div>

                      <div className="text-xs text-neutral-300 mb-2">
                        <span className="text-[#9E7EB5]">Domains: </span>
                        {prof.domains.map((d, dIdx) => (
                          <span key={dIdx} className="font-mono text-[#C4A4DA] bg-[#2A1438] px-1.5 py-0.5 rounded text-[11px] mr-1">
                            {d}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-1.5 mt-3 pt-2 border-t border-[#4C2365]/60 text-xs">
                        <div className="text-[11px] font-semibold text-[#9E7EB5]">Configured Field Rules:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(prof.fields || {}).map(([fName, rule]: [string, any], fIdx) => (
                            <span
                              key={fIdx}
                              className={`text-[11px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                                rule.required
                                  ? 'bg-[#4C2365] border-[#7F5D99] text-[#EBE2CC]'
                                  : 'bg-[#15081E] border-[#3E1B54] text-[#C4A4DA]'
                              }`}
                              title={`Selector: ${rule.selector || rule.table_row || 'default'} | Required: ${rule.required}`}
                            >
                              <span>{fName}</span>
                              {rule.required && <span className="text-amber-400 font-bold">*</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#4C2365]/60 flex items-center justify-between">
                      <span className="text-[10px] text-[#9E7EB5]">
                        {Object.keys(prof.fields || {}).length} fields defined
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (prof.domains[0]?.includes('books.toscrape.com')) {
                            setUrlInput('https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html');
                          } else if (prof.domains[0]?.includes('quotes.toscrape.com')) {
                            setUrlInput('https://quotes.toscrape.com/page/1/');
                          } else {
                            setUrlInput(`https://${prof.domains[0]}/`);
                          }
                          setIsMultiLine(false);
                          setActiveTab('console');
                        }}
                        className="px-3 py-1 rounded bg-[#4C2365] hover:bg-[#7F5D99] text-xs font-medium text-[#EBE2CC] transition flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current text-[#EBE2CC]" /> Test Profile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile Builder Form */}
            <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#C4A4DA]" />
                <h3 className="text-base font-bold text-[#EBE2CC]">Create Custom Domain Profile</h3>
              </div>
              <p className="text-xs text-[#9E7EB5]">
                Generate a new YAML selector profile for any site directly from the UI. Saved profiles are instantly recognized by the crawler engine.
              </p>

              <form onSubmit={handleCreateProfile} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-[#C4A4DA] font-medium mb-1">Profile Name</label>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g. news, techcrunch, mdn"
                      className="w-full bg-[#1F0E2A] border border-[#7F5D99] rounded px-3 py-2 text-[#EBE2CC] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A4DA]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#C4A4DA] font-medium mb-1">Target Host / Domain</label>
                    <input
                      type="text"
                      value={newProfileDomain}
                      onChange={(e) => setNewProfileDomain(e.target.value)}
                      placeholder="e.g. news.ycombinator.com"
                      className="w-full bg-[#1F0E2A] border border-[#7F5D99] rounded px-3 py-2 text-[#EBE2CC] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A4DA]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#C4A4DA] font-medium mb-1">Record Type</label>
                    <input
                      type="text"
                      value={newProfileType}
                      onChange={(e) => setNewProfileType(e.target.value)}
                      placeholder="e.g. Story, Article, Product"
                      className="w-full bg-[#1F0E2A] border border-[#7F5D99] rounded px-3 py-2 text-[#EBE2CC] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A4DA]"
                    />
                  </div>
                </div>

                {/* Field rules list */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#EBE2CC]">Extracted Fields & CSS Selectors:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewProfileFields([...newProfileFields, { name: '', selector: '', required: false }])
                      }
                      className="px-2 py-0.5 rounded bg-[#4C2365] text-[#C4A4DA] hover:text-white text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Field
                    </button>
                  </div>

                  {newProfileFields.map((f, fIdx) => (
                    <div key={fIdx} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={f.name}
                          onChange={(e) => {
                            const updated = [...newProfileFields];
                            updated[fIdx].name = e.target.value;
                            setNewProfileFields(updated);
                          }}
                          placeholder="Field name (e.g. title, price)"
                          className="w-full bg-[#1F0E2A] border border-[#4C2365] rounded px-2.5 py-1.5 text-[#EBE2CC] font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-5">
                        <input
                          type="text"
                          value={f.selector}
                          onChange={(e) => {
                            const updated = [...newProfileFields];
                            updated[fIdx].selector = e.target.value;
                            setNewProfileFields(updated);
                          }}
                          placeholder="CSS selector (e.g. span.titleline a)"
                          className="w-full bg-[#1F0E2A] border border-[#4C2365] rounded px-2.5 py-1.5 text-[#EBE2CC] font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-[#C4A4DA]">
                          <input
                            type="checkbox"
                            checked={f.required}
                            onChange={(e) => {
                              const updated = [...newProfileFields];
                              updated[fIdx].required = e.target.checked;
                              setNewProfileFields(updated);
                            }}
                            className="rounded bg-[#1F0E2A] border-[#7F5D99] text-[#7F5D99] w-3.5 h-3.5"
                          />
                          Required
                        </label>
                      </div>
                      <div className="col-span-1 text-right">
                        {newProfileFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewProfileFields(newProfileFields.filter((_, i) => i !== fIdx));
                            }}
                            className="text-rose-400 hover:text-rose-200 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={profileSaving || !newProfileName.trim() || !newProfileDomain.trim()}
                    className="px-5 py-2 rounded-lg bg-[#7F5D99] hover:bg-[#9E7EB5] disabled:opacity-50 text-xs font-semibold text-[#EBE2CC] transition flex items-center gap-1.5"
                  >
                    {profileSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Save & Deploy Profile
                  </button>
                </div>
              </form>
            </div>

            {/* CLI Commands Section */}
            <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-[#EBE2CC]">Command Line Usage for Other Sites</h3>
              <p className="text-xs text-[#9E7EB5]">
                You can execute crawls on any website directly from your terminal using Python:
              </p>
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-[#15081E] border border-[#3E1B54] rounded-lg">
                  <div className="text-[11px] text-[#9E7EB5] mb-1"># Crawl quotes.toscrape.com using the quotes.yaml profile:</div>
                  <code className="text-[#EBE2CC]">python crawler/main.py https://quotes.toscrape.com/page/1/</code>
                </div>
                <div className="p-3 bg-[#15081E] border border-[#3E1B54] rounded-lg">
                  <div className="text-[11px] text-[#9E7EB5] mb-1"># Scrape any article or table URL using Universal Generic Mode + Gemini AI:</div>
                  <code className="text-[#EBE2CC]">python crawler/main.py https://en.wikipedia.org/wiki/Web_crawler --llm</code>
                </div>
                <div className="p-3 bg-[#15081E] border border-[#3E1B54] rounded-lg">
                  <div className="text-[11px] text-[#9E7EB5] mb-1"># Crawl arbitrary multi-page URLs from a text file:</div>
                  <code className="text-[#EBE2CC]">python crawler/main.py --urls my_targets.txt --scroll</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Stage 2 Specifications */}
        {activeTab === 'specs' && (
          <div className="bg-[#2A1438] border border-[#4C2365] rounded-xl p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-[#EBE2CC]">Stage 2 Technical Specifications & Architecture</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] space-y-2">
                <h4 className="font-semibold text-white">Dual-Mode Extraction Pipeline</h4>
                <p className="text-[#9E7EB5] leading-relaxed">
                  Matches domain against profiles in <code className="text-[#C4A4DA]">profiles/books.yaml</code>. If matched, executes strict CSS/table selectors with dynamic Pydantic schema validation. If unmatched, automatically falls back to <code className="text-[#C4A4DA]">generic_extractor.py</code>.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] space-y-2">
                <h4 className="font-semibold text-white">Gemini LLM Fallback (gemini-3.8-flash)</h4>
                <p className="text-[#9E7EB5] leading-relaxed">
                  Enabled with <code className="text-[#C4A4DA]">--llm</code> flag. Extracts missing required fields via Google Gemini REST endpoint using <code className="text-[#C4A4DA]">GEMINI_API_KEY</code>.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] space-y-2">
                <h4 className="font-semibold text-white">Multi-Format Atomic Exporters</h4>
                <p className="text-[#9E7EB5] leading-relaxed">
                  Simultaneously produces <code className="text-[#C4A4DA]">data.json</code>, <code className="text-[#C4A4DA]">data.csv</code>, multi-sheet <code className="text-[#C4A4DA]">data.xlsx</code> (with Extracted Tables sheet), and <code className="text-[#C4A4DA]">summary.txt</code>.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#1F0E2A] border border-[#4C2365] space-y-2">
                <h4 className="font-semibold text-white">SSRF & Network Safety</h4>
                <p className="text-[#9E7EB5] leading-relaxed">
                  Performs pre-fetch DNS host resolution via <code className="text-[#C4A4DA]">socket.getaddrinfo</code>, rejecting any IPv4/IPv6 addresses in loopback, private, or multicast ranges.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
