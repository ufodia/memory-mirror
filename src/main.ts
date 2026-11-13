import './style.css';
import { cleanupChecklist, reportJson } from './core/exports.ts';
import { CATEGORIES, normalizeRelation } from './core/report.ts';
import type { FindingView, Report } from './core/report.ts';
import { DEFAULT_OPTIONS } from './core/types.ts';
import type { Category, ScanOptions } from './core/types.ts';
import { demoFiles } from './demo.ts';
import { byId, download, formatDate, formatNumber, h, svg } from './dom.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/** Browsers cannot safely hold much more than this in one tab. */
const MAX_TOTAL_BYTES = 1_500_000_000;
const PAGE = 150;

type Tab = 'overview' | 'findings' | 'people' | 'cleanup' | 'export';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'findings', label: 'Findings' },
  { id: 'people', label: 'People' },
  { id: 'cleanup', label: 'Cleanup plan' },
  { id: 'export', label: 'Export' },
];

const SOURCE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  openwebui: 'Open WebUI',
  sillytavern: 'SillyTavern',
  text: 'Text transcript',
};

const sourceName = (platform: string) => SOURCE_LABELS[platform] ?? 'Transcript';

const ICONS: Record<Category, string> = {
  credentials: 'M8 11V8a4 4 0 1 1 8 0v3M6 11h12v9H6z',
  'government-id': 'M4 6h16v12H4zM8 10h3M8 14h6M15 10h2',
  health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  sensitive: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  financial: 'M4 7h16v10H4zM4 11h16M8 15h3',
  watchlist: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  location: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  people:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 0a2.5 2.5 0 1 0 0-5M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 14c2.8 0 5 2.2 5 5',
  contact: 'M4 6h16v12H4zM4 7l8 6 8-6',
  work: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  identity: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
};

let worker: Worker | null = null;
let job = 0;
let report: Report | null = null;
let options: ScanOptions = { ...DEFAULT_OPTIONS };
let revealAll = false;
const revealed = new Set<string>();
const hiddenValues = new Set<string>();
const reviewed = new Set<string>();
let tab: Tab = 'overview';
let filter: { category: Category | 'all'; confidence: 'all' | 'high'; query: string } = {
  category: 'all',
  confidence: 'all',
  query: '',
};
let shown = PAGE;

const intro = byId('intro');
const progress = byId('progress');
const dashboard = byId('dashboard');
const introError = byId('intro-error');

function getWorker(): Worker {
  if (worker) return worker;
  const engine = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker = engine;
  engine.addEventListener('message', (event: MessageEvent<WorkerResponse>) => onMessage(event.data));
  engine.addEventListener('error', () => {
    if (worker !== engine) return;
    engine.terminate();
    worker = null;
    job++;
    showError('The analysis engine stopped unexpectedly. Try opening the export again.');
  });
  return engine;
}

function send(request: WorkerRequest, transfer: Transferable[] = []) {
  try {
    getWorker().postMessage(request, transfer);
  } catch {
    showError('The analysis engine could not start. Try reloading this page in a supported browser.');
  }
}

function onMessage(message: WorkerResponse) {
  if (message.job !== job) return; // A newer request superseded this one.
  if (message.type === 'progress') {
    byId('progress-message').textContent = message.message;
    byId('progress-bar').style.width = `${Math.round(message.ratio * 100)}%`;
  } else if (message.type === 'report') {
    report = message.report;
    shown = PAGE;
    showView('dashboard');
    renderDashboard();
    dashboard.querySelector<HTMLElement>('h1')?.focus();
  } else if (message.type === 'redacted') {
    download('memory-mirror-redacted-transcript.md', message.text, 'text/markdown');
  } else if (message.type === 'error') {
    showError(message.message);
  }
}

function showView(view: 'intro' | 'progress' | 'dashboard') {
  intro.hidden = view !== 'intro';
  progress.hidden = view !== 'progress';
  dashboard.hidden = view !== 'dashboard';
  document.body.dataset.view = view;
}

function showError(message: string) {
  showView(report ? 'dashboard' : 'intro');
  if (!report) {
    introError.textContent = message;
    introError.hidden = false;
  } else {
    toast(message);
  }
}

function toast(message: string) {
  const note = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(note);
  setTimeout(() => note.remove(), 4200);
}

function clearReportState() {
  report = null;
  revealed.clear();
  hiddenValues.clear();
  reviewed.clear();
  revealAll = false;
  tab = 'overview';
  filter = { category: 'all', confidence: 'all', query: '' };
  dashboard.replaceChildren();
}

function beginScan() {
  // Reserve the job before reading a File, so a slower old selection cannot
  // replace a newer result. Termination also releases the preceding archive.
  const nextJob = ++job;
  worker?.terminate();
  worker = null;
  clearReportState();
  introError.hidden = true;
  showView('progress');
  byId('progress-message').textContent = 'Reading files…';
  byId('progress-bar').style.width = '2%';
  return nextJob;
}

function withinSizeLimit(total: number) {
  if (total <= MAX_TOTAL_BYTES) return true;
  showError(
    'These files are larger than 1.5 GB. Open conversations.json on its own instead of the whole archive.',
  );
  return false;
}

async function scanFiles(files: { name: string; bytes: ArrayBuffer }[], scanJob?: number) {
  if (!files.length || !withinSizeLimit(files.reduce((n, f) => n + f.bytes.byteLength, 0))) return;
  const nextJob = scanJob ?? beginScan();
  if (nextJob !== job) return;
  send(
    { type: 'scan', job: nextJob, files, options },
    files.map((f) => f.bytes),
  );
}

async function scanFileList(list: FileList | File[]) {
  const selection = [...list];
  if (!selection.length) return;
  const scanJob = beginScan();
  if (!withinSizeLimit(selection.reduce((n, file) => n + file.size, 0))) return;
  try {
    const files: { name: string; bytes: ArrayBuffer }[] = [];
    for (const file of selection) {
      const bytes = await file.arrayBuffer();
      if (scanJob !== job) return;
      files.push({ name: file.name, bytes });
    }
    await scanFiles(files, scanJob);
  } catch {
    if (scanJob === job) showError('A selected file could not be read. Choose the file again and retry.');
  }
}

// ——— Intro interactions ———

const fileInput = byId<HTMLInputElement>('file-input');
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) void scanFileList(fileInput.files);
  fileInput.value = '';
});
byId('demo-button').addEventListener('click', () => {
  void scanFiles(demoFiles().map((f) => ({ name: f.name, bytes: f.bytes.slice().buffer })));
});
for (const type of ['dragenter', 'dragover'])
  window.addEventListener(type, (event) => {
    event.preventDefault();
    document.body.classList.add('dragging');
  });
for (const type of ['dragleave', 'drop'])
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (type === 'drop' || (event as DragEvent).relatedTarget === null)
      document.body.classList.remove('dragging');
  });
window.addEventListener('drop', (event) => {
  const files = (event as DragEvent).dataTransfer?.files;
  if (files?.length) void scanFileList(files);
});

// ——— Dashboard ———

const isRevealed = (id: string) => (revealAll ? !hiddenValues.has(id) : revealed.has(id));

function scoreRing(value: number, level: string) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return h(
    'div',
    { class: `score level-${level.toLowerCase().replace(' ', '-')}` },
    svg(
      'svg',
      { viewBox: '0 0 128 128', 'aria-hidden': 'true' },
      svg('circle', { cx: 64, cy: 64, r: radius, class: 'track' }),
      svg('circle', {
        cx: 64,
        cy: 64,
        r: radius,
        class: 'value',
        'stroke-dasharray': `${(circumference * value) / 100} ${circumference}`,
        transform: 'rotate(-90 64 64)',
      }),
    ),
    h('div', { class: 'score-label' }, h('strong', {}, String(value)), h('span', {}, level)),
  );
}

function icon(category: Category) {
  return svg(
    'svg',
    { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' },
    svg('path', { d: ICONS[category] }),
  );
}

function renderDashboard() {
  if (!report) return;
  const r = report;
  const uniqueItems = r.categories.reduce((n, c) => n + c.unique, 0);
  const range = r.stats.first
    ? `${formatDate(r.stats.first)} – ${formatDate(r.stats.last)}`
    : 'No dates in export';

  const header = h(
    'div',
    { class: 'summary' },
    scoreRing(r.score.value, r.score.level),
    h(
      'div',
      { class: 'summary-text' },
      h('p', { class: 'eyebrow' }, 'Exposure score'),
      h('h1', { tabindex: -1 }, headline(r)),
      h(
        'p',
        { class: 'muted' },
        `${formatNumber(r.stats.conversations)} conversations · ${range}. The score weighs unique items by sensitivity; it is a prompt for review, not a measurement of risk.`,
      ),
      r.stats.warnings.length ? h('p', { class: 'warning' }, r.stats.warnings.join(' ')) : null,
    ),
    h(
      'div',
      { class: 'summary-actions' },
      toggle('Privacy screen', !revealAll, (on) => {
        revealAll = !on;
        revealed.clear();
        hiddenValues.clear();
        renderDashboard();
      }),
      h(
        'button',
        { class: 'button ghost small', type: 'button', onclick: () => reset() },
        'Scan another export',
      ),
    ),
  );

  const kpis = h(
    'div',
    { class: 'kpis' },
    kpi(formatNumber(r.stats.userMessages), 'messages you wrote'),
    kpi(formatNumber(r.stats.words), 'words you shared'),
    kpi(formatNumber(uniqueItems), 'unique sensitive items'),
    kpi(formatNumber(r.people.length), 'other people mentioned'),
  );

  const optionsBar = renderOptions();
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Report sections' });
  for (const t of TABS) {
    const count =
      t.id === 'findings'
        ? r.findings.length
        : t.id === 'people'
          ? r.people.length
          : t.id === 'cleanup'
            ? r.conversations.length
            : undefined;
    tabs.append(
      h(
        'button',
        {
          class: 'tab',
          role: 'tab',
          id: `tab-${t.id}`,
          type: 'button',
          'aria-selected': String(tab === t.id),
          'aria-controls': 'panel',
          tabindex: tab === t.id ? 0 : -1,
          onclick: () => selectTab(t.id),
          onkeydown: (event: Event) => {
            const key = (event as KeyboardEvent).key;
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(key)) return;
            event.preventDefault();
            const index = TABS.findIndex((x) => x.id === tab);
            const next =
              key === 'Home'
                ? TABS[0]
                : key === 'End'
                  ? TABS[TABS.length - 1]
                  : TABS[(index + (key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
            selectTab(next.id);
          },
        },
        t.label,
        count !== undefined ? h('span', { class: 'count' }, formatNumber(count)) : null,
      ),
    );
  }
  const panel = h('div', {
    id: 'panel',
    class: 'panel',
    role: 'tabpanel',
    tabindex: 0,
    'aria-labelledby': `tab-${tab}`,
  });
  panel.append(renderTab(r));
  dashboard.replaceChildren(header, kpis, optionsBar, tabs, panel);
}

function headline(r: Report): string {
  if (!r.findings.length) return 'Nothing sensitive stood out.';
  const top = r.categories.slice(0, 3).map((c) => c.label.toLowerCase());
  return `Your chats reveal ${top.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
}

function kpi(value: string, label: string) {
  return h('div', { class: 'kpi' }, h('strong', {}, value), h('span', {}, label));
}

function toggle(label: string, on: boolean, change: (on: boolean) => void) {
  return h(
    'button',
    {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      onclick: () => change(!on),
    },
    h('span', { class: 'knob', 'aria-hidden': 'true' }),
    label,
  );
}

function selectTab(next: Tab) {
  tab = next;
  shown = PAGE;
  renderDashboard();
  byId(`tab-${next}`).focus();
}

function renderOptions() {
  const watch = h('input', {
    id: 'watch-input',
    type: 'text',
    placeholder: 'Watch words, e.g. a child’s name, a project codename',
    value: options.watchlist.join(', '),
    'aria-label': 'Watch words, separated by commas',
  });
  const assistant = h('input', {
    id: 'include-assistant',
    type: 'checkbox',
    checked: options.includeAssistant,
  });
  const apply = () => {
    options = {
      includeAssistant: assistant.checked,
      watchlist: watch.value
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    };
    revealed.clear();
    hiddenValues.clear();
    reviewed.clear();
    revealAll = false;
    filter = { category: 'all', confidence: 'all', query: '' };
    showView('progress');
    send({ type: 'rescan', job: ++job, options });
  };
  return h(
    'form',
    {
      class: 'options',
      onsubmit: (event: Event) => {
        event.preventDefault();
        apply();
      },
    },
    h('label', { class: 'check' }, assistant, 'Also scan assistant replies'),
    watch,
    h('button', { class: 'button small', type: 'submit' }, 'Rescan'),
  );
}

function renderTab(r: Report): Node {
  switch (tab) {
    case 'overview':
      return renderOverview(r);
    case 'findings':
      return renderFindings(r);
    case 'people':
      return renderPeople(r);
    case 'cleanup':
      return renderCleanup(r);
    case 'export':
      return renderExport(r);
  }
}

function renderOverview(r: Report): Node {
  if (!r.categories.length)
    return h('p', { class: 'empty' }, 'No findings. Try adding watch words, or include assistant replies.');
  const maxPoints = Math.max(...r.categories.map((c) => c.points));
  const grid = h('div', { class: 'category-grid' });
  for (const c of r.categories) {
    grid.append(
      h(
        'article',
        { class: `category-card cat-${c.category}` },
        h(
          'header',
          {},
          icon(c.category),
          h('h3', {}, c.label),
          h('span', { class: 'pill' }, `${c.unique} unique`),
        ),
        h(
          'div',
          { class: 'meter', 'aria-hidden': 'true' },
          h('span', { style: `width:${Math.max(6, (c.points / maxPoints) * 100)}%` }),
        ),
        h('p', { class: 'muted' }, c.description),
        h(
          'ul',
          { class: 'items' },
          ...c.items
            .slice(0, 4)
            .map((item) =>
              h(
                'li',
                {},
                h('span', { class: 'item-label' }, item.label),
                h('code', {}, revealAll ? item.value : item.masked),
                h('span', { class: 'times' }, `×${item.count}`),
              ),
            ),
        ),
        h(
          'button',
          {
            class: 'link',
            type: 'button',
            onclick: () => {
              filter = { ...filter, category: c.category };
              selectTab('findings');
            },
          },
          `See all ${formatNumber(c.findings)} findings →`,
        ),
      ),
    );
  }
  return h('div', {}, grid, renderTimeline(r));
}

function renderTimeline(r: Report): Node | string {
  if (r.timeline.length < 2) return '';
  const width = 720;
  const height = 160;
  const max = Math.max(...r.timeline.map((m) => m.count));
  const step = width / r.timeline.length;
  const bars = r.timeline.map((m, i) => {
    const barHeight = Math.max(3, (m.count / max) * (height - 30));
    return svg(
      'g',
      {},
      svg('rect', {
        x: i * step + step * 0.18,
        y: height - 20 - barHeight,
        width: step * 0.64,
        height: barHeight,
        rx: 4,
      }),
      svg('title', {}, `${m.month}: ${m.count} findings`),
      svg(
        'text',
        { x: i * step + step / 2, y: height - 4, 'text-anchor': 'middle' },
        m.month.slice(2).replace('-', '/'),
      ),
    );
  });
  return h(
    'section',
    { class: 'timeline' },
    h('h2', {}, 'When you shared it'),
    svg(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Findings per month' },
      ...bars,
    ),
  );
}

function matchesFilter(f: FindingView) {
  if (filter.category !== 'all' && f.category !== filter.category) return false;
  if (filter.confidence === 'high' && f.confidence !== 'high') return false;
  if (filter.query) {
    const q = filter.query.toLowerCase();
    const haystack =
      `${f.label} ${f.conversationTitle} ${isRevealed(f.id) ? f.value : f.masked}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function renderFindings(r: Report): Node {
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const all = [
    { id: 'all' as const, label: 'All', count: r.findings.length },
    ...r.categories.map((c) => ({ id: c.category, label: c.label, count: c.findings })),
  ];
  for (const chip of all)
    chips.append(
      h(
        'button',
        {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(filter.category === chip.id),
          onclick: () => {
            filter = { ...filter, category: chip.id };
            shown = PAGE;
            renderDashboard();
          },
        },
        `${chip.label} `,
        h('span', { class: 'count' }, formatNumber(chip.count)),
      ),
    );
  const search = h('input', {
    type: 'search',
    placeholder: 'Search findings and conversation titles',
    value: filter.query,
    'aria-label': 'Search findings',
  });
  search.addEventListener('input', () => {
    filter = { ...filter, query: search.value };
    shown = PAGE;
    const list = document.getElementById('finding-list');
    list?.replaceWith(findingList(r));
  });
  const confidence = h(
    'label',
    { class: 'check' },
    h('input', {
      type: 'checkbox',
      checked: filter.confidence === 'high',
      onchange: (e: Event) => {
        filter = { ...filter, confidence: (e.target as HTMLInputElement).checked ? 'high' : 'all' };
        renderDashboard();
      },
    }),
    'High confidence only',
  );
  return h('div', {}, chips, h('div', { class: 'toolbar' }, search, confidence), findingList(r));
}

function findingList(r: Report): HTMLElement {
  const list = r.findings.filter(matchesFilter);
  const container = h('div', { id: 'finding-list', class: 'finding-list' });
  if (!list.length) container.append(h('p', { class: 'empty' }, 'No findings match these filters.'));
  for (const f of list.slice(0, shown)) container.append(findingCard(f, r));
  if (list.length > shown)
    container.append(
      h(
        'button',
        {
          class: 'button ghost more',
          type: 'button',
          onclick: () => {
            shown += PAGE;
            container.replaceWith(findingList(r));
          },
        },
        `Show ${Math.min(PAGE, list.length - shown)} more of ${formatNumber(list.length - shown)}`,
      ),
    );
  return container;
}

function findingCard(f: FindingView, r: Report) {
  const conversation = r.conversations.find((c) => c.id === f.conversationId);
  const open = isRevealed(f.id);
  const value = h(
    'button',
    {
      class: `value ${open ? 'open' : ''}`,
      type: 'button',
      'aria-label': open ? `Hide value: ${f.value}` : 'Reveal value',
      title: open ? 'Hide' : 'Reveal',
      onclick: () => {
        if (revealAll) {
          if (hiddenValues.has(f.id)) hiddenValues.delete(f.id);
          else hiddenValues.add(f.id);
        } else if (revealed.has(f.id)) revealed.delete(f.id);
        else revealed.add(f.id);
        card.replaceWith(findingCard(f, r));
      },
    },
    open ? f.value : f.masked,
  );
  const card = h(
    'article',
    { class: `finding cat-${f.category}` },
    h(
      'header',
      {},
      icon(f.category),
      h('span', { class: 'finding-label' }, f.label),
      f.confidence === 'medium' ? h('span', { class: 'pill soft' }, 'check') : null,
      h('span', { class: 'pill' }, CATEGORIES[f.category].label),
    ),
    h(
      'p',
      { class: 'context' },
      open ? f.before : maskContext(f.before),
      value,
      open ? f.after : maskContext(f.after),
    ),
    h(
      'footer',
      {},
      conversation?.url
        ? h(
            'a',
            { href: conversation.url, target: '_blank', rel: 'noopener noreferrer' },
            `${f.conversationTitle} ↗`,
          )
        : h('span', {}, f.conversationTitle),
      conversation ? h('span', {}, `Source: ${sourceName(conversation.platform)}`) : null,
      h('span', {}, formatDate(f.time)),
      h(
        'span',
        {},
        f.kind === 'message' ? (f.role === 'user' ? 'You wrote' : 'Assistant wrote') : sourceLabel(f.kind),
      ),
    ),
  );
  return card;
}

/** Context around a hidden value is blurred too, so a reveal is always deliberate. */
function maskContext(text: string) {
  return h('span', { class: 'blur', 'aria-hidden': 'true' }, text);
}

function sourceLabel(kind: FindingView['kind']) {
  return {
    attachment: 'Attachment',
    instructions: 'Custom instructions',
    memory: 'Saved memory',
    document: 'Text file',
    message: 'Message',
  }[kind];
}

function renderPeople(r: Report): Node {
  if (!r.people.length)
    return h(
      'p',
      { class: 'empty' },
      'No family, friend or colleague mentions matched the current detectors.',
    );
  return h(
    'div',
    {},
    h(
      'p',
      { class: 'lead small' },
      'Review the details you shared about other people, including whether you have their permission to keep them in the chat.',
    ),
    h(
      'div',
      { class: 'people-grid' },
      ...r.people.map((p) =>
        h(
          'article',
          { class: 'person' },
          h(
            'div',
            { class: 'avatar', 'aria-hidden': 'true' },
            normalizeRelation(p.relation)[0].toUpperCase(),
          ),
          h(
            'div',
            {},
            h('h3', {}, capitalize(p.relation)),
            h(
              'p',
              { class: 'muted' },
              p.names.length
                ? p.names.map((n) => (revealAll ? n : `${n[0]}•••`)).join(', ')
                : 'No name given',
            ),
          ),
          h(
            'div',
            { class: 'person-meta' },
            p.minor ? h('span', { class: 'pill warn' }, 'Child') : null,
            h('span', {}, `${p.mentions} mentions`),
            h('span', {}, `${p.conversations} chats`),
          ),
        ),
      ),
    ),
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function renderCleanup(r: Report): Node {
  if (!r.conversations.length) return h('p', { class: 'empty' }, 'No conversation needs attention.');
  const max = r.conversations[0].points || 1;
  const rows = r.conversations.slice(0, shown).map((c) => {
    const box = h('input', {
      type: 'checkbox',
      checked: reviewed.has(c.id),
      'aria-label': `Mark “${c.title}” as reviewed`,
    });
    box.addEventListener('change', () => {
      if (box.checked) reviewed.add(c.id);
      else reviewed.delete(c.id);
      row.classList.toggle('done', box.checked);
      byId('reviewed-count').textContent = String(reviewed.size);
    });
    const row = h(
      'li',
      { class: `cleanup-row ${reviewed.has(c.id) ? 'done' : ''}` },
      box,
      h(
        'div',
        { class: 'cleanup-main' },
        c.url
          ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, `${c.title} ↗`)
          : h('strong', {}, c.title),
        h(
          'div',
          { class: 'cleanup-tags' },
          h('span', { class: 'pill' }, `Source: ${sourceName(c.platform)}`),
          ...c.categories.map((cat) => h('span', { class: `tag cat-${cat}` }, CATEGORIES[cat].label)),
        ),
      ),
      h(
        'div',
        { class: 'cleanup-side' },
        h(
          'div',
          { class: 'meter', 'aria-hidden': 'true' },
          h('span', { style: `width:${(c.points / max) * 100}%` }),
        ),
        h('span', { class: 'muted' }, `${c.findings} findings · ${formatDate(c.created)}`),
      ),
    );
    return row;
  });
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'toolbar' },
      h(
        'p',
        { class: 'muted' },
        h('strong', { id: 'reviewed-count' }, String(reviewed.size)),
        ` of ${r.conversations.length} reviewed. Links open the conversation in its app, where you can delete it.`,
      ),
      h(
        'button',
        {
          class: 'button small',
          type: 'button',
          onclick: () => download('memory-mirror-cleanup.md', cleanupChecklist(r, reviewed), 'text/markdown'),
        },
        'Download checklist',
      ),
    ),
    h('ol', { class: 'cleanup' }, ...rows),
    r.conversations.length > shown
      ? h(
          'button',
          {
            class: 'button ghost more',
            type: 'button',
            onclick: () => {
              const previous = shown;
              shown += PAGE;
              byId('panel').replaceChildren(renderCleanup(r));
              document.querySelectorAll<HTMLInputElement>('.cleanup-row input')[previous]?.focus();
            },
          },
          `Show ${Math.min(PAGE, r.conversations.length - shown)} more conversations`,
        )
      : null,
  );
}

function renderExport(r: Report): Node {
  const card = (title: string, text: string, action: string, onclick: () => void, warn = false) =>
    h(
      'article',
      { class: `export-card ${warn ? 'warn' : ''}` },
      h('h3', {}, title),
      h('p', { class: 'muted' }, text),
      h('button', { class: `button ${warn ? 'ghost' : 'primary'} small`, type: 'button', onclick }, action),
    );
  return h(
    'div',
    { class: 'export-grid' },
    card(
      'Masked report',
      'JSON with categories, counts, conversation titles and masked values. Review it before sharing; titles and missed details can still be sensitive.',
      'Download JSON',
      () => download('memory-mirror-report.json', reportJson(r)),
    ),
    card(
      'Cleanup checklist',
      'Markdown list of conversations to review, most revealing first, with links to open them.',
      'Download Markdown',
      () => download('memory-mirror-cleanup.md', cleanupChecklist(r, reviewed), 'text/markdown'),
    ),
    card(
      'Redacted transcript',
      'Every conversation with detected values replaced by placeholders like [PERSON_1]. Useful for sharing or migrating — read it first.',
      'Download Markdown',
      () => send({ type: 'redact', job }),
    ),
    card(
      'Raw report',
      'The same report with real, unmasked values and context. Treat it like the original export.',
      'Download raw JSON',
      () => {
        if (confirm('This file contains your real values. Download it?'))
          download('memory-mirror-report-raw.json', reportJson(r, true));
      },
      true,
    ),
  );
}

function reset() {
  job++;
  worker?.terminate();
  worker = null;
  options = { ...DEFAULT_OPTIONS, watchlist: [] };
  clearReportState();
  introError.hidden = true;
  showView('intro');
  fileInput.focus();
}

showView('intro');
