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
} from 'lucide-react';

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

const PRESET_URLS = [
  'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
  'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html',
  'https://books.toscrape.com/catalogue/soumission_998/index.html',
  'https://books.toscrape.com/catalogue/sharp-objects_997/index.html',
  'https://books.toscrape.com/catalogue/sapiens-a-brief-history-of-humankind_996/index.html',
  'https://books.toscrape.com/catalogue/the-requiem-red_995/index.html',
  'https://books.toscrape.com/catalogue/the-dirty-little-secrets-of-getting-your-dream-job_994/index.html',
  'https://books.toscrape.com/catalogue/the-coming-woman-a-novel-based-on-the-life-of-the-infamous-feminist-victoria-woodhull_993/index.html',
];

// Robust JSON fetcher that gracefully guards against non-JSON (HTML 404/SPA) responses
async function safeJsonFetch<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'records' | 'history' | 'tests' | 'specs'>('console');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [urlInput, setUrlInput] = useState<string>(PRESET_URLS[0]);
  const [isMultiLine, setIsMultiLine] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [testOutput, setTestOutput] = useState<{ stdout?: string; passed?: boolean; exit_code?: number } | null>(null);
  const [testingRunning, setTestingRunning] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Poll status & runs safely
  const fetchStatusAndRuns = async () => {
    try {
      const [statusRes, runsRes] = await Promise.all([
        safeJsonFetch<any>('/api/status'),
        safeJsonFetch<RunSummary[]>('/api/runs'),
      ]);

      if (statusRes?.activeJob) {
        setActiveJob(statusRes.activeJob);
      } else {
        setActiveJob(null);
      }

      if (Array.isArray(runsRes)) {
        setRuns(runsRes);
        if (!selectedRunId && runsRes.length > 0) {
          setSelectedRunId(runsRes[0].id);
        }
      }
    } catch {
      // Handled safely without UI crash
    }
  };

  useEffect(() => {
    fetchStatusAndRuns();
    const interval = setInterval(fetchStatusAndRuns, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch detail for selected run safely
  useEffect(() => {
    if (!selectedRunId) return;
    safeJsonFetch<RunDetail>(`/api/runs/${selectedRunId}`).then((data) => {
      if (data && !('error' in (data as any))) {
        setRunDetail(data);
      }
    });
  }, [selectedRunId, activeJob?.status]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeJob?.logs]);

  const handleStartCrawl = async () => {
    const urls = urlInput
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = await safeJsonFetch(res.url);
      if (res.ok) {
        setActiveTab('console');
        fetchStatusAndRuns();
      } else {
        alert(data?.error || 'Failed to start crawl');
      }
    } catch (e: any) {
      alert(`Request error: ${e.message}`);
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
        body: JSON.stringify({ runId }),
      });
      const data = await safeJsonFetch(res.url);
      if (res.ok) {
        setActiveTab('console');
        fetchStatusAndRuns();
      } else {
        alert(data?.error || 'Failed to resume run');
      }
    } catch (e: any) {
      alert(`Resume error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput((prev) => (prev ? `${prev}\n${text.trim()}` : text.trim()));
      }
    } catch {
      alert('Unable to access clipboard. Please manually paste your link.');
    }
  };

  const handleRunTests = async () => {
    setTestingRunning(true);
    try {
      const data = await safeJsonFetch('/api/tests/run', { method: 'POST' });
      setTestOutput(data);
    } catch (e: any) {
      setTestOutput({ stdout: `Failed to execute tests: ${e.message}`, passed: false });
    } finally {
      setTestingRunning(false);
    }
  };

  const handleCopyRecord = (record: any, idx: number) => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  // Direct Browser Download (JSON)
  const downloadJsonToDisk = (runIdToDownload?: string) => {
    const targetId = runIdToDownload || selectedRunId;
    if (!targetId) return;

    const recordsToExport =
      targetId === runDetail?.id && runDetail?.records ? runDetail.records : [];

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(recordsToExport, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `books_extracted_${targetId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setDownloadSuccessToast(`Successfully downloaded books_extracted_${targetId}.json to your local drive!`);
    setTimeout(() => setDownloadSuccessToast(null), 4000);
  };

  // Direct Browser Download (CSV)
  const downloadCsvToDisk = () => {
    if (!runDetail?.records || runDetail.records.length === 0) return;
    const items = runDetail.records;
    const headers = ['title', 'price', 'upc', 'availability', 'domain', 'source_url', 'fetched_at'];
    const csvRows = [
      headers.join(','),
      ...items.map((r) =>
        headers
          .map((h) => {
            const val = (r[h] || '').toString().replace(/"/g, '""');
            return `"${val}"`;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `books_extracted_${runDetail.id}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    setDownloadSuccessToast(`Successfully downloaded books_extracted_${runDetail.id}.csv to your local drive!`);
    setTimeout(() => setDownloadSuccessToast(null), 4000);
  };

  const filteredRecords = (runDetail?.records || []).filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.title && r.title.toLowerCase().includes(term)) ||
      (r.upc && r.upc.toLowerCase().includes(term)) ||
      (r.price && r.price.toLowerCase().includes(term))
    );
  });

  const parsedUrlCount = urlInput.split('\n').filter((u) => u.trim()).length;
  const hasExternalUrls = urlInput
    .split('\n')
    .some((u) => u.trim() && !u.includes('books.toscrape.com'));

  return (
    <div className="min-h-screen bg-[#110817] text-slate-100 flex flex-col font-sans selection:bg-[#7F5D99] selection:text-[#EBE2CC]">
      {/* Toast Notification */}
      {downloadSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#4C2365] border border-[#EBE2CC]/50 text-[#EBE2CC] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs animate-bounce font-medium">
          <CheckCircle2 className="w-4 h-4 text-[#EBE2CC]" />
          <span>{downloadSuccessToast}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-[#4C2365]/60 bg-[#1A0C24]/95 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-[#4C2365] text-[#EBE2CC] rounded-xl border border-[#7F5D99]/50 shadow-inner">
            <BookOpen className="w-5 h-5 text-[#EBE2CC]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-extrabold text-[#EBE2CC] tracking-tight">Books Crawler Studio</h1>
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded bg-[#4C2365] border border-[#7F5D99] text-[#EBE2CC]">
                Stage 1 Spec
              </span>
            </div>
            <p className="text-xs text-[#9E7EB5] flex items-center gap-1.5 mt-0.5">
              Domain Target:
              <span className="text-[#EBE2CC] font-mono font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EBE2CC] animate-pulse"></span>
                books.toscrape.com
              </span>
            </p>
          </div>
        </div>

        {/* Global Navigation Tabs */}
        <div className="flex items-center space-x-1 bg-[#120719] p-1 rounded-xl border border-[#4C2365]/70 text-xs">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-2 ${
              activeTab === 'console'
                ? 'bg-[#7F5D99] text-[#EBE2CC] shadow-md border border-[#EBE2CC]/30'
                : 'text-[#9E7EB5] hover:text-[#EBE2CC] hover:bg-[#2A1339]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Crawl Console
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-2 ${
              activeTab === 'records'
                ? 'bg-[#7F5D99] text-[#EBE2CC] shadow-md border border-[#EBE2CC]/30'
                : 'text-[#9E7EB5] hover:text-[#EBE2CC] hover:bg-[#2A1339]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Extracted Records
            {runDetail?.records && runDetail.records.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-[#4C2365] text-[#EBE2CC] rounded text-[10px] font-bold">
                {runDetail.records.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-[#7F5D99] text-[#EBE2CC] shadow-md border border-[#EBE2CC]/30'
                : 'text-[#9E7EB5] hover:text-[#EBE2CC] hover:bg-[#2A1339]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Run History ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-2 ${
              activeTab === 'tests'
                ? 'bg-[#7F5D99] text-[#EBE2CC] shadow-md border border-[#EBE2CC]/30'
                : 'text-[#9E7EB5] hover:text-[#EBE2CC] hover:bg-[#2A1339]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Test Suite (32 Tests)
          </button>
          <button
            onClick={() => setActiveTab('specs')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-2 ${
              activeTab === 'specs'
                ? 'bg-[#7F5D99] text-[#EBE2CC] shadow-md border border-[#EBE2CC]/30'
                : 'text-[#9E7EB5] hover:text-[#EBE2CC] hover:bg-[#2A1339]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Rules & Safety
          </button>
        </div>

        {/* Global Action / Status Area */}
        <div className="flex items-center gap-3">
          {runDetail?.records && runDetail.records.length > 0 && (
            <button
              onClick={() => downloadJsonToDisk()}
              className="px-3.5 py-1.5 bg-[#4C2365] hover:bg-[#7F5D99] border border-[#EBE2CC]/40 text-[#EBE2CC] text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 transition"
              title="Save extracted data directly to your computer's downloads folder"
            >
              <Download className="w-3.5 h-3.5 text-[#EBE2CC]" />
              <span>Download Local File</span>
            </button>
          )}

          {activeJob?.status === 'running' ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#7F5D99]/30 border border-[#EBE2CC]/40 text-[#EBE2CC] text-xs font-mono font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#EBE2CC]" />
              Crawling...
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Ready
            </div>
          )}
        </div>
      </header>

      {/* PROMINENT URL PASTE & EXTRACTION BAR */}
      <section className="bg-gradient-to-r from-[#210D30] via-[#35164B] to-[#210D30] border-b border-[#4C2365] px-6 py-4 shadow-xl">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#EBE2CC] uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#EBE2CC]" />
              Extract Data From URL (Paste Links Below):
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMultiLine(!isMultiLine)}
                className="text-[11px] font-semibold text-[#C4A4DA] hover:text-[#EBE2CC] flex items-center gap-1 transition"
              >
                <Layers className="w-3 h-3" />
                {isMultiLine ? 'Switch to Single Line' : 'Multi-link Batch Mode'}
              </button>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-2.5 py-1 text-[11px] bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] font-semibold rounded-lg border border-[#7F5D99]/60 flex items-center gap-1 transition shadow-sm"
                title="Paste link from clipboard"
              >
                <ClipboardPaste className="w-3 h-3" />
                Paste Link
              </button>
              <button
                type="button"
                onClick={() => setUrlInput('')}
                className="p-1 text-[#9E7EB5] hover:text-rose-300 transition"
                title="Clear input"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* External domain warning hint */}
          {hasExternalUrls && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                <strong>Note:</strong> Stage 1 uses fixed CSS rules for <code>books.toscrape.com</code>. Non-book
                sites will fail the <code>title</code> selector requirement.
              </span>
            </div>
          )}

          {/* Input Bar Form */}
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="relative flex-1">
              {isMultiLine ? (
                <textarea
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  rows={3}
                  disabled={activeJob?.status === 'running'}
                  placeholder="Paste one or more books.toscrape.com links (one per line)..."
                  className="w-full bg-[#11071A] border-2 border-[#7F5D99]/60 rounded-xl p-3 text-xs font-mono text-[#EBE2CC] placeholder-slate-500 focus:outline-none focus:border-[#EBE2CC] transition shadow-inner"
                />
              ) : (
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={activeJob?.status === 'running'}
                  placeholder="https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
                  className="w-full bg-[#11071A] border-2 border-[#7F5D99]/60 rounded-xl px-4 py-2.5 text-xs font-mono text-[#EBE2CC] placeholder-slate-500 focus:outline-none focus:border-[#EBE2CC] transition shadow-inner"
                />
              )}
            </div>

            <button
              onClick={handleStartCrawl}
              disabled={loading || activeJob?.status === 'running' || parsedUrlCount === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-[#7F5D99] to-[#4C2365] hover:from-[#9E7EB5] hover:to-[#7F5D99] active:scale-95 text-[#EBE2CC] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#4C2365]/50 border border-[#EBE2CC]/30 transition disabled:opacity-40 whitespace-nowrap"
            >
              {loading || activeJob?.status === 'running' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#EBE2CC]" />
                  Extracting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-[#EBE2CC]" />
                  Extract Data ({parsedUrlCount})
                </>
              )}
            </button>
          </div>

          {/* Quick Preset Selector Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[#9E7EB5]">
            <span className="font-bold text-[#EBE2CC]">Quick Select Samples:</span>
            <button
              type="button"
              onClick={() => {
                setUrlInput(PRESET_URLS[0]);
                setIsMultiLine(false);
              }}
              className="px-2.5 py-0.5 rounded-full bg-[#1A0C24] hover:bg-[#4C2365] border border-[#7F5D99]/50 text-[#EBE2CC] font-medium transition"
            >
              Book 1: A Light in the Attic
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput(PRESET_URLS[1]);
                setIsMultiLine(false);
              }}
              className="px-2.5 py-0.5 rounded-full bg-[#1A0C24] hover:bg-[#4C2365] border border-[#7F5D99]/50 text-[#EBE2CC] font-medium transition"
            >
              Book 2: Tipping the Velvet
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlInput(PRESET_URLS.slice(0, 5).join('\n'));
                setIsMultiLine(true);
              }}
              className="px-2.5 py-0.5 rounded-full bg-[#1A0C24] hover:bg-[#4C2365] border border-[#7F5D99]/50 text-[#EBE2CC] font-medium transition"
            >
              Top 5 Books Batch
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {/* TAB 1: CRAWL CONSOLE */}
        {activeTab === 'console' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Crawler Status & Download Card */}
            <div className="lg:col-span-5 space-y-5">
              {/* Download Local File Card */}
              {runDetail && (
                <div className="bg-[#1C0D26] border border-[#4C2365] rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#7F5D99]/15 rounded-full blur-2xl pointer-events-none"></div>
                  <h3 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2 mb-1">
                    <Download className="w-4 h-4 text-[#EBE2CC]" />
                    Save Extracted Data To Your Computer
                  </h3>
                  <p className="text-xs text-[#9E7EB5] mb-4">
                    Download structured records for run <span className="font-mono text-[#EBE2CC] font-semibold">{runDetail.id}</span> directly to your local drive.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => downloadJsonToDisk(runDetail.id)}
                      className="flex-1 px-4 py-2.5 bg-[#4C2365] hover:bg-[#7F5D99] active:scale-95 text-[#EBE2CC] font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-[#EBE2CC]/30 transition shadow-md"
                    >
                      <Download className="w-3.5 h-3.5 text-[#EBE2CC]" />
                      Download JSON
                    </button>
                    <button
                      onClick={downloadCsvToDisk}
                      className="flex-1 px-4 py-2.5 bg-[#2B143A] hover:bg-[#4C2365] active:scale-95 text-[#EBE2CC] font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-[#7F5D99]/50 transition shadow-md"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Download CSV
                    </button>
                  </div>
                </div>
              )}

              {/* Pipeline Specs Summary Box */}
              <div className="bg-[#180A22] border border-[#4C2365]/70 rounded-2xl p-5 text-xs space-y-3">
                <h3 className="font-bold text-[#EBE2CC] flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#9E7EB5]" />
                  Sequential Pipeline Compliance
                </h3>
                <ul className="text-[#9E7EB5] space-y-2 pl-4 list-disc marker:text-[#7F5D99]">
                  <li>
                    <strong className="text-[#EBE2CC]">Strict SSRF Protection:</strong> Rejects loopback (127.0.0.1, localhost), private networks, and link-local ranges.
                  </li>
                  <li>
                    <strong className="text-[#EBE2CC]">robots.txt Check:</strong> Evaluated before every fetch (disallows 401/403, permits 404).
                  </li>
                  <li>
                    <strong className="text-[#EBE2CC]">Headless Chromium:</strong> Fresh context created per URL, closed in `finally` block before extraction.
                  </li>
                  <li>
                    <strong className="text-[#EBE2CC]">Garbage Collection:</strong> `gc.collect()` called immediately after browser closes to prevent memory leaks.
                  </li>
                  <li>
                    <strong className="text-[#EBE2CC]">Politeness Rate:</strong> Enforces 3.0s delay between page requests.
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column: Live Logs Terminal */}
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-[#160B1F] border border-[#4C2365] rounded-2xl overflow-hidden shadow-xl flex flex-col h-[520px]">
                {/* Terminal Header */}
                <div className="px-4 py-3 bg-[#1F0E2D] border-b border-[#4C2365] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                    <span className="text-xs font-mono text-[#EBE2CC] ml-2 font-bold">crawler/run.log</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeJob && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#4C2365] text-[#EBE2CC] font-semibold">
                        Job: {activeJob.id}
                      </span>
                    )}
                    <button
                      onClick={fetchStatusAndRuns}
                      className="p-1 hover:bg-[#34164B] rounded text-[#9E7EB5] hover:text-[#EBE2CC] transition"
                      title="Refresh"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Log Stream Output */}
                <div
                  ref={logContainerRef}
                  className="flex-1 p-4 bg-[#0E0614] font-mono text-xs overflow-y-auto space-y-1 select-text"
                >
                  {activeJob?.logs && activeJob.logs.length > 0 ? (
                    activeJob.logs.map((line, i) => {
                      let colorClass = 'text-slate-300';
                      if (line.includes('[DONE]')) colorClass = 'text-emerald-400 font-semibold';
                      else if (line.includes('[BLOCKED]')) colorClass = 'text-amber-400 font-semibold';
                      else if (line.includes('[FAILED]') || line.includes('[STDERR]')) colorClass = 'text-rose-400 font-semibold';
                      else if (line.includes('Starting')) colorClass = 'text-[#EBE2CC] font-bold';
                      return (
                        <div key={i} className={`leading-relaxed ${colorClass}`}>
                          {line}
                        </div>
                      );
                    })
                  ) : runDetail ? (
                    <div className="space-y-1.5">
                      <div className="text-[#9E7EB5] mb-2 font-sans font-medium">
                        # Displaying extracted URL logs for run <span className="font-mono text-[#EBE2CC] font-bold">{runDetail.id}</span>:
                      </div>
                      {runDetail.urls.map((u, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-white/5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold tracking-wider ${
                              u.status === 'done'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : u.status === 'blocked'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {u.status}
                          </span>
                          <span className="text-[#9E7EB5] truncate flex-1 font-mono">{u.url}</span>
                          {u.record && <span className="text-[#EBE2CC] font-semibold">'{u.record.title}'</span>}
                          {u.error && <span className="text-rose-400">{u.error}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[#9E7EB5]/60 space-y-2">
                      <Terminal className="w-8 h-8 opacity-40 text-[#9E7EB5]" />
                      <p>No active crawl running. Paste a link in the bar above and click "Extract Data".</p>
                    </div>
                  )}
                </div>

                {/* Terminal Footer */}
                <div className="px-4 py-2.5 bg-[#1A0C24] border-t border-[#4C2365] text-[11px] text-[#9E7EB5] flex items-center justify-between">
                  <div>
                    {activeJob?.status === 'running'
                      ? 'Chromium headless context running'
                      : activeJob?.status === 'completed'
                      ? 'Extraction completed'
                      : 'System ready'}
                  </div>
                  {runDetail?.id && (
                    <button
                      onClick={() => downloadJsonToDisk(runDetail.id)}
                      className="text-[#EBE2CC] hover:underline font-bold flex items-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save data.json
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXTRACTED RECORDS */}
        {activeTab === 'records' && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1C0D26] border border-[#4C2365] p-4 rounded-2xl shadow-md">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="w-4 h-4 text-[#9E7EB5] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by title, UPC, or price..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-[#11071A] border border-[#7F5D99]/50 rounded-xl text-xs text-[#EBE2CC] placeholder-[#9E7EB5]/60 focus:outline-none focus:border-[#EBE2CC]"
                  />
                </div>
                {/* Run selector */}
                <select
                  value={selectedRunId || ''}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="bg-[#11071A] border border-[#7F5D99]/50 rounded-xl px-3 py-1.5 text-xs text-[#EBE2CC] focus:outline-none focus:border-[#EBE2CC]"
                >
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      Run: {r.id} ({r.done} records)
                    </option>
                  ))}
                </select>
              </div>

              {selectedRunId && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadJsonToDisk(selectedRunId)}
                    className="px-4 py-2 bg-[#7F5D99] hover:bg-[#9E7EB5] active:scale-95 text-[#EBE2CC] rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition border border-[#EBE2CC]/30"
                  >
                    <Download className="w-3.5 h-3.5 text-[#EBE2CC]" />
                    Download JSON to Drive
                  </button>
                  <button
                    onClick={downloadCsvToDisk}
                    className="px-3.5 py-2 bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] rounded-xl text-xs font-bold flex items-center gap-1.5 border border-[#7F5D99]/60 transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    CSV
                  </button>
                </div>
              )}
            </div>

            {/* Records Grid */}
            {filteredRecords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRecords.map((book, idx) => (
                  <div
                    key={idx}
                    className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl p-5 hover:border-[#7F5D99] transition flex flex-col justify-between shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-extrabold text-[#EBE2CC] text-sm line-clamp-2">{book.title}</h3>
                        <span className="text-[#EBE2CC] font-black text-sm whitespace-nowrap bg-[#4C2365] px-2.5 py-1 rounded-lg border border-[#7F5D99]/60">
                          {book.price}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
                        <div className="bg-[#11071A] p-2.5 rounded-xl border border-[#4C2365]/60">
                          <span className="text-[#9E7EB5] block text-[10px] uppercase font-sans font-bold">UPC Code</span>
                          <span className="text-[#EBE2CC] font-bold">{book.upc || 'N/A'}</span>
                        </div>
                        <div className="bg-[#11071A] p-2.5 rounded-xl border border-[#4C2365]/60">
                          <span className="text-[#9E7EB5] block text-[10px] uppercase font-sans font-bold">Availability</span>
                          <span className="text-emerald-300 font-semibold">{book.availability || 'Unknown'}</span>
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] text-[#9E7EB5] space-y-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#9E7EB5]/70">Domain:</span>
                          <span className="font-mono text-slate-300">{book.domain}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#9E7EB5]/70">Fetched:</span>
                          <span className="font-mono text-slate-300">{book.fetched_at}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#4C2365] flex items-center justify-between text-xs">
                      <a
                        href={book.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#EBE2CC] hover:underline font-semibold flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Original Page
                      </a>
                      <button
                        onClick={() => handleCopyRecord(book, idx)}
                        className="px-2.5 py-1 rounded-lg bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] flex items-center gap-1 text-[11px] transition font-bold"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Record
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl p-12 text-center text-[#9E7EB5]">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40 text-[#EBE2CC]" />
                <p>No records found in this run matching your search.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: RUN HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl overflow-hidden shadow-lg">
              <div className="px-6 py-4 border-b border-[#4C2365] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#EBE2CC]">Runs Stored in SQLite (`crawl.db`)</h2>
                  <p className="text-xs text-[#9E7EB5]">
                    Browse past runs, resume interrupted tasks, and download data files to your drive.
                  </p>
                </div>
                <button
                  onClick={fetchStatusAndRuns}
                  className="px-3 py-1.5 bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              <div className="divide-y divide-[#4C2365]/50">
                {runs.map((r) => {
                  const isSelected = selectedRunId === r.id;
                  const hasUnfinished = r.pending > 0 || r.failed > 0;
                  return (
                    <div
                      key={r.id}
                      className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                        isSelected ? 'bg-[#311743]/50' : 'hover:bg-[#251034]/30'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#EBE2CC] text-sm">{r.id}</span>
                          <span className="text-xs text-[#9E7EB5] font-mono">
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {r.done} done
                          </span>
                          {r.blocked > 0 && (
                            <span className="flex items-center gap-1 text-amber-400 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" /> {r.blocked} blocked
                            </span>
                          )}
                          {r.failed > 0 && (
                            <span className="flex items-center gap-1 text-rose-400 font-bold">
                              <XCircle className="w-3.5 h-3.5" /> {r.failed} failed
                            </span>
                          )}
                          {r.pending > 0 && (
                            <span className="flex items-center gap-1 text-[#9E7EB5]">
                              <Clock className="w-3.5 h-3.5" /> {r.pending} pending
                            </span>
                          )}
                          <span className="text-[#9E7EB5]/70">({r.total} total URLs)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedRunId(r.id);
                            setActiveTab('records');
                          }}
                          className="px-3.5 py-1.5 bg-[#4C2365] hover:bg-[#7F5D99] text-[#EBE2CC] text-xs rounded-xl font-bold transition"
                        >
                          View Records
                        </button>
                        {hasUnfinished && (
                          <button
                            onClick={() => handleResume(r.id)}
                            disabled={activeJob?.status === 'running'}
                            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs rounded-xl font-bold flex items-center gap-1.5 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Resume Run
                          </button>
                        )}
                        <button
                          onClick={() => downloadJsonToDisk(r.id)}
                          className="px-3 py-1.5 bg-[#7F5D99] hover:bg-[#9E7EB5] text-[#EBE2CC] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition border border-[#EBE2CC]/30"
                          title="Download data.json directly to disk"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TEST SUITE */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#EBE2CC]" />
                    Offline Unit Test Suite (32 Tests)
                  </h2>
                  <p className="text-xs text-[#9E7EB5] mt-0.5">
                    Runs pytest offline verifying URL validation, robots caching, HTML cleaning, extractor fixtures,
                    and SQLite persistence.
                  </p>
                </div>
                <button
                  onClick={handleRunTests}
                  disabled={testingRunning}
                  className="px-4 py-2 bg-[#7F5D99] hover:bg-[#9E7EB5] active:scale-95 text-[#EBE2CC] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#7F5D99]/30 transition disabled:opacity-50 border border-[#EBE2CC]/30"
                >
                  <Play className="w-3.5 h-3.5 fill-[#EBE2CC]" />
                  {testingRunning ? 'Running Pytest...' : 'Run Test Suite'}
                </button>
              </div>

              {testOutput && (
                <div className="mt-4 space-y-3">
                  <div
                    className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                      testOutput.passed
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {testOutput.passed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        All 32 Offline Unit Tests Passed Successfully (100% Pass Rate)
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-400" />
                        Test Failures Detected
                      </>
                    )}
                  </div>

                  <div className="bg-[#0E0614] border border-[#4C2365] rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-96 text-slate-300 whitespace-pre leading-relaxed">
                    {testOutput.stdout}
                  </div>
                </div>
              )}
            </div>

            {/* Test Module Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_urlcheck.py (16 tests)</span>
                <p className="text-[#9E7EB5]">SSRF safety, loopback, private ranges, link-local, schemes & length bounds.</p>
              </div>
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_robots.py (6 tests)</span>
                <p className="text-[#9E7EB5]">Allowed/disallowed rules, 404 permitted, 401/403 denied, host-level caching.</p>
              </div>
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_extractors.py (2 tests)</span>
                <p className="text-[#9E7EB5]">Verified against book_1.html fixture and book_1.expected.json ground truth.</p>
              </div>
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_cleaner.py (1 test)</span>
                <p className="text-[#9E7EB5]">Strips script, style, nav, footer, svg tags; preserves visible text.</p>
              </div>
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_store.py (4 tests)</span>
                <p className="text-[#9E7EB5]">Schema init, status transitions, resumption pending filter, SQL injection safety.</p>
              </div>
              <div className="bg-[#1A0C24] border border-[#4C2365] p-4 rounded-2xl">
                <span className="font-bold text-[#EBE2CC] block mb-1">test_exporters.py (3 tests)</span>
                <p className="text-[#9E7EB5]">Valid UTF-8 JSON, empty array handling, and run overwrite protection.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RULES & SAFETY */}
        {activeTab === 'specs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl p-5 space-y-4 shadow-lg">
              <h2 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#EBE2CC]" />
                Active Profile: `profiles/books.yaml`
              </h2>
              <div className="bg-[#11071A] border border-[#4C2365]/80 rounded-xl p-4 font-mono text-xs text-[#EBE2CC] overflow-x-auto leading-relaxed">
{`name: books
domains: [books.toscrape.com]
record_type: Book
fields:
  title:
    selector: "div.product_main h1"
    attr: text
    required: true
  price:
    selector: "p.price_color"
    attr: text
    required: false
  upc:
    table_row: "UPC"
    required: false
  availability:
    selector: "p.availability"
    attr: text
    required: false`}
              </div>
            </div>

            <div className="bg-[#1A0C24] border border-[#4C2365] rounded-2xl p-5 space-y-4 shadow-lg">
              <h2 className="text-sm font-bold text-[#EBE2CC] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#EBE2CC]" />
                Crawler Constraints & Compliance
              </h2>
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[#11071A] border border-[#4C2365]/60 rounded-xl">
                  <span className="text-[#EBE2CC] font-bold block mb-0.5">Sequential Execution:</span>
                  <span className="text-[#9E7EB5]">Headless browser opens fresh context per URL and explicitly closes context before extraction.</span>
                </div>
                <div className="p-3 bg-[#11071A] border border-[#4C2365]/60 rounded-xl">
                  <span className="text-[#EBE2CC] font-bold block mb-0.5">Garbage Collection:</span>
                  <span className="text-[#9E7EB5]">`gc.collect()` is triggered after browser teardown to maintain strict memory boundaries.</span>
                </div>
                <div className="p-3 bg-[#11071A] border border-[#4C2365]/60 rounded-xl">
                  <span className="text-[#EBE2CC] font-bold block mb-0.5">Network Safety (SSRF):</span>
                  <span className="text-[#9E7EB5]">Hostnames are DNS-resolved and checked against private, loopback, and link-local CIDR ranges.</span>
                </div>
                <div className="p-3 bg-[#11071A] border border-[#4C2365]/60 rounded-xl">
                  <span className="text-[#EBE2CC] font-bold block mb-0.5">Scope Boundary:</span>
                  <span className="text-[#9E7EB5]">Stage 1 strictly targets `books.toscrape.com`. Out-of-scope AI/LLM clients and concurrent scrapers are disabled.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
