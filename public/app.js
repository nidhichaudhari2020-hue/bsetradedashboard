const $ = id => document.getElementById(id);
let records = [], page = 0, job = null, connected = false, reconnect = 500, live = false;
const format = new Intl.NumberFormat('en-IN');
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function render() {
  $('count').textContent = format.format(records.length);
  $('value').textContent = '₹' + (records.reduce((sum, t) => sum + t.quantity * t.price, 0) / 10000000).toFixed(2) + ' Cr';
  $('clients').textContent = new Set(records.map(t => t.client)).size;
  $('symbols').textContent = new Set(records.map(t => t.symbol)).size;
  const query = $('search').value.toLowerCase();
  const filtered = records.filter(t => [t.id, t.client, t.symbol].some(s => s.toLowerCase().includes(query)));
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  $('rows').replaceChildren(...filtered.slice(page * 10, page * 10 + 10).map(t => {
    const row = document.createElement('tr');
    [t.id.startsWith('seed') ? t.id : t.id.slice(0, 8) + '…' + t.id.slice(-5), t.client, t.symbol, format.format(t.quantity), rupee.format(t.price), time.format(new Date(t.timestamp))].forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (index === 0) cell.title = t.id;
      if (index === 2) { const badge = document.createElement('span'); badge.className = 'symbol'; badge.textContent = value; cell.replaceChildren(badge); }
      if (index === 3 || index === 4) cell.className = 'number';
      row.append(cell);
    }); return row;
  }));
  $('ledger-count').textContent = format.format(filtered.length);
  $('range').textContent = filtered.length ? `Showing ${page * 10 + 1}–${Math.min(page * 10 + 10, filtered.length)} of ${format.format(filtered.length)} trades` : 'No matching trades';
  $('page').textContent = page + 1;
  $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 10 >= filtered.length;
}
function renderJob() {
  const running = job?.status === 'running';
  $('pull').disabled = running || !connected;
  $('pull').textContent = running ? '↻  Pull in progress' : '↓  Pull latest trades';
  $('job-status').textContent = job?.status.toUpperCase() ?? 'IDLE';
  $('sync-title').textContent = running ? 'Syncing in the background' : job?.status === 'completed' ? 'You’re up to date' : job?.status === 'failed' ? 'Pull interrupted' : 'Ready when you are';
  $('sync-text').textContent = running ? `${job.pages} of 60 pages received. Your saved trades are ready to explore.` : job?.status === 'failed' ? `${job.error}. Saved trades are safe; start a new pull to retry.` : 'Saved trades stay available while the next batch arrives.';
  $('progress').style.width = `${(job?.pages ?? 0) / 60 * 100}%`;
}
function applySnapshot(data) { records = data.trades; job = data.job; render(); renderJob(); }
// One cache read for first paint. WebSocket snapshots are authoritative thereafter.
fetch('/api/trades').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => { if (!live) applySnapshot(data); }).catch(() => { $('notice').textContent = 'Saved trades unavailable. Waiting for live connection.'; });
function connect() {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`);
  socket.onopen = () => { connected = true; reconnect = 500; $('connection').textContent = '● Live connection'; renderJob(); };
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'snapshot') { const previous = records.length; live = true; applySnapshot(data); if (records.length > previous && previous) $('notice').textContent = `${format.format(records.length - previous)} trades added automatically.`; }
    if (data.type === 'job') { job = data.job; renderJob(); }
  };
  socket.onclose = () => { connected = false; $('connection').textContent = '○ Reconnecting…'; renderJob(); setTimeout(connect, reconnect); reconnect = Math.min(reconnect * 2, 10000); };
  socket.onerror = () => socket.close();
}
connect();
$('pull').onclick = async () => {
  $('pull').disabled = true; $('notice').textContent = '';
  try { const response = await fetch('/api/pulls', { method: 'POST' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); }
  catch (e) { $('notice').textContent = e.message; renderJob(); }
};
$('search').oninput = () => { page = 0; render(); };
$('previous').onclick = () => { page--; render(); };
$('next').onclick = () => { page++; render(); };
