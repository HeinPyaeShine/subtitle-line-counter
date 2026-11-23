import {
  buildDuplicateKey,
  calculateInclusiveLines,
  formatRecordLine,
  parseBatchInput,
  validateRecordFields
} from './parser.js';

// Application State
let supabaseClient = null;
let records = [];
let realtimeChannel = null;

// DOM Elements
const els = {
  syncStatus: document.getElementById('syncStatus'),
  syncText: document.querySelector('#syncStatus .sync-text'),
  grandTotal: document.getElementById('grandTotal'),
  recordCount: document.getElementById('recordCount'),
  recordForm: document.getElementById('recordForm'),
  batchInput: document.getElementById('batchInput'),
  addBtn: document.getElementById('addBtn'),
  formError: document.getElementById('formError'),
  copyListBtn: document.getElementById('copyListBtn'),
  exportTxtBtn: document.getElementById('exportTxtBtn'),
  removeAllBtn: document.getElementById('removeAllBtn'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  tableWrapper: document.getElementById('tableWrapper'),
  recordsBody: document.getElementById('recordsBody'),
  // Edit Modal
  editModal: document.getElementById('editModal'),
  editForm: document.getElementById('editForm'),
  editRecordId: document.getElementById('editRecordId'),
  editProjectName: document.getElementById('editProjectName'),
  editEpisode: document.getElementById('editEpisode'),
  editStartLine: document.getElementById('editStartLine'),
  editEndLine: document.getElementById('editEndLine'),
  editCalculatedTotal: document.getElementById('editCalculatedTotal'),
  editError: document.getElementById('editError'),
  closeEditModal: document.getElementById('closeEditModal'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  // Confirm Modal
  confirmModal: document.getElementById('confirmModal'),
  confirmCount: document.getElementById('confirmCount'),
  closeConfirmModal: document.getElementById('closeConfirmModal'),
  cancelRemoveAllBtn: document.getElementById('cancelRemoveAllBtn'),
  confirmRemoveAllBtn: document.getElementById('confirmRemoveAllBtn'),
  // Toasts
  toastContainer: document.getElementById('toastContainer')
};

/* =========================================
   Utilities
   ========================================= */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, ''');
}

function showToast(message, type = 'default') {
  const toast = document.createElement('div');
  toast.className = `toast ${type !== 'default' ? `toast--${type}` : ''}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function setSyncStatus(state, label) {
  els.syncStatus.classList.remove('is-online', 'is-error');
  if (state === 'online') els.syncStatus.classList.add('is-online');
  if (state === 'error') els.syncStatus.classList.add('is-error');
  els.syncText.textContent = label;
}

function showFormError(messages) {
  if (!messages || messages.length === 0) {
    els.formError.classList.add('hidden');
    els.formError.innerHTML = '';
    return;
  }
  els.formError.innerHTML = messages.map((m) => `<div>${escapeHtml(m)}</div>`).join('');
  els.formError.classList.remove('hidden');
}

function computeGrandTotal() {
  return records.reduce((sum, rec) => sum + Number(rec.total_lines || 0), 0);
}

/* =========================================
   Supabase Initialization & Realtime
   ========================================= */
async function initSupabase() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();

    if (!res.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(config.error || 'Missing Supabase configuration.');
    }

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    await fetchRecords();
    subscribeToRealtime();
  } catch (err) {
    console.error('Initialization failed:', err);
    setSyncStatus('error', 'Connection Error');
    els.loadingState.classList.add('hidden');
    showFormError([
      'Could not connect to Supabase. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are configured in Vercel.'
    ]);
  }
}

async function fetchRecords() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('subtitle_records')
    .select('*')
    .order('created_at', { ascending: true });

  els.loadingState.classList.add('hidden');

  if (error) {
    console.error('Fetch error:', error);
    setSyncStatus('error', 'Sync Failed');
    showToast('Failed to load records from database.', 'error');
    return;
  }

  records = data || [];
  renderRecords();
}

function subscribeToRealtime() {
  if (!supabaseClient) return;

  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel('shared-subtitle-records')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subtitle_records' },
      () => {
        // Re-fetch authoritative sorted list to safely handle simultaneous multi-user updates
        fetchRecords();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('online', 'Live Sync');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSyncStatus('error', 'Reconnecting...');
      }
    });
}

/* =========================================
   Rendering
   ========================================= */
function renderRecords() {
  const grandTotal = computeGrandTotal();
  els.grandTotal.textContent = grandTotal.toLocaleString();
  els.recordCount.textContent = records.length.toLocaleString();

  const hasRecords = records.length > 0;
  els.copyListBtn.disabled = !hasRecords;
  els.exportTxtBtn.disabled = !hasRecords;
  els.removeAllBtn.disabled = !hasRecords;

  if (!hasRecords) {
    els.tableWrapper.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    els.recordsBody.innerHTML = '';
    return;
  }

  els.emptyState.classList.add('hidden');
  els.tableWrapper.classList.remove('hidden');

  els.recordsBody.innerHTML = records
    .map((rec) => {
      const epDisplay = rec.episode
        ? `<span class="ep-badge">${escapeHtml(rec.episode)}</span>`
        : '<span style="color: var(--text-muted);">—</span>';

      return `
        <tr data-id="${escapeHtml(rec.id)}">
          <td data-label="Project">
            <span class="project-name">${escapeHtml(rec.project_name)}</span>
          </td>
          <td data-label="Episode">${epDisplay}</td>
          <td data-label="Start" class="num-col">${Number(rec.start_line).toLocaleString()}</td>
          <td data-label="End" class="num-col">${Number(rec.end_line).toLocaleString()}</td>
          <td data-label="Total Lines" class="num-col">
            <span class="lines-pill">${Number(rec.total_lines).toLocaleString()}</span>
          </td>
          <td data-label="Actions" class="actions-col">
            <div class="row-actions">
              <button type="button" class="btn btn-secondary btn-sm edit-btn" data-id="${escapeHtml(rec.id)}">Edit</button>
              <button type="button" class="btn btn-danger-outline btn-sm delete-btn" data-id="${escapeHtml(rec.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

/* =========================================
   Add Records
   ========================================= */
async function handleAddSubmit(event) {
  event.preventDefault();
  showFormError([]);

  if (!supabaseClient) {
    showFormError(['Database connection is not ready yet.']);
    return;
  }

  const { validRecords, errors } = parseBatchInput(els.batchInput.value, records);

  if (errors.length > 0) {
    showFormError(errors);
    return;
  }

  els.addBtn.disabled = true;

  const { data, error } = await supabaseClient
    .from('subtitle_records')
    .insert(validRecords)
    .select();

  els.addBtn.disabled = false;

  if (error) {
    console.error('Insert error:', error);
    showFormError(['Failed to save records. Please try again.']);
    return;
  }

  if (data && data.length > 0) {
    // Avoid duplicates if Realtime already appended them
    const existingIds = new Set(records.map((r) => r.id));
    data.forEach((item) => {
      if (!existingIds.has(item.id)) records.push(item);
    });
    renderRecords();
  }

  els.batchInput.value = '';
  els.batchInput.focus();
  const label = validRecords.length === 1 ? '1 record added.' : `${validRecords.length} records added.`;
  showToast(label, 'success');
}

/* =========================================
   Edit Record Modal
   ========================================= */
function openEditModal(id) {
  const record = records.find((r) => r.id === id);
  if (!record) return;

  els.editRecordId.value = record.id;
  els.editProjectName.value = record.project_name;
  els.editEpisode.value = record.episode || '';
  els.editStartLine.value = record.start_line;
  els.editEndLine.value = record.end_line;
  els.editError.classList.add('hidden');
  updateEditPreview();

  els.editModal.classList.remove('hidden');
  els.editProjectName.focus();
}

function closeEditModal() {
  els.editModal.classList.add('hidden');
}

function updateEditPreview() {
  const start = Number(els.editStartLine.value);
  const end = Number(els.editEndLine.value);
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= 1) {
    els.editCalculatedTotal.textContent = calculateInclusiveLines(start, end).toLocaleString();
  } else {
    els.editCalculatedTotal.textContent = '—';
  }
}

async function handleEditSubmit(event) {
  event.preventDefault();
  els.editError.classList.add('hidden');

  const id = els.editRecordId.value;
  const validation = validateRecordFields({
    projectName: els.editProjectName.value,
    episode: els.editEpisode.value,
    startLine: els.editStartLine.value,
    endLine: els.editEndLine.value
  });

  if (!validation.valid) {
    els.editError.textContent = validation.error;
    els.editError.classList.remove('hidden');
    return;
  }

  // Prevent editing into an exact duplicate of another record
  const newKey = buildDuplicateKey(validation.record);
  const isDuplicate = records.some((r) => r.id !== id && buildDuplicateKey(r) === newKey);
  if (isDuplicate) {
    els.editError.textContent = 'Another record with this exact title, episode, and range already exists.';
    els.editError.classList.remove('hidden');
    return;
  }

  els.saveEditBtn.disabled = true;

  const { data, error } = await supabaseClient
    .from('subtitle_records')
    .update(validation.record)
    .eq('id', id)
    .select()
    .single();

  els.saveEditBtn.disabled = false;

  if (error) {
    console.error('Update error:', error);
    els.editError.textContent = 'Failed to update record. Please try again.';
    els.editError.classList.remove('hidden');
    return;
  }

  records = records.map((r) => (r.id === id ? data : r));
  renderRecords();
  closeEditModal();
  showToast('Record updated.', 'success');
}

/* =========================================
   Delete Single & Remove All
   ========================================= */
async function handleDeleteSingle(id) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from('subtitle_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete error:', error);
    showToast('Failed to delete record.', 'error');
    return;
  }

  records = records.filter((r) => r.id !== id);
  renderRecords();
  showToast('Record deleted.', 'success');
}

function openConfirmModal() {
  if (records.length === 0) return;
  els.confirmCount.textContent = `${records.length} ${records.length === 1 ? 'record' : 'records'}`;
  els.confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  els.confirmModal.classList.add('hidden');
}

async function handleRemoveAll() {
  if (!supabaseClient) return;
  els.confirmRemoveAllBtn.disabled = true;

  // Supabase requires a filter condition for delete operations
  const { error } = await supabaseClient
    .from('subtitle_records')
    .delete()
    .not('id', 'is', null);

  els.confirmRemoveAllBtn.disabled = false;

  if (error) {
    console.error('Remove all error:', error);
    showToast('Failed to remove all records.', 'error');
    return;
  }

  records = [];
  renderRecords();
  closeConfirmModal();
  showToast('All records removed.', 'success');
}

/* =========================================
   Copy List & Export TXT
   ========================================= */
function buildFormattedReport() {
  const lines = records.map(formatRecordLine);
  const grandTotal = computeGrandTotal();
  return ['SUBTITLE RECORDS', ...lines, `TOTAL = ${grandTotal}`].join('\n');
}

async function handleCopyList() {
  if (records.length === 0) return;
  const text = buildFormattedReport();

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const tempArea = document.createElement('textarea');
      tempArea.value = text;
      tempArea.style.position = 'fixed';
      tempArea.style.opacity = '0';
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      tempArea.remove();
    }
    showToast('Subtitle list copied to clipboard!', 'success');
  } catch (err) {
    console.error('Clipboard copy error:', err);
    showToast('Could not copy to clipboard.', 'error');
  }
}

function handleExportTxt() {
  if (records.length === 0) return;

  const content = buildFormattedReport() + '\n';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `subtitle-records-${dateStamp}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast('TXT file downloaded.', 'success');
}

/* =========================================
   Event Listeners & Boot
   ========================================= */
els.recordForm.addEventListener('submit', handleAddSubmit);
els.copyListBtn.addEventListener('click', handleCopyList);
els.exportTxtBtn.addEventListener('click', handleExportTxt);
els.removeAllBtn.addEventListener('click', openConfirmModal);

// Delegated row actions
els.recordsBody.addEventListener('click', (event) => {
  const editBtn = event.target.closest('.edit-btn');
  if (editBtn) {
    openEditModal(editBtn.dataset.id);
    return;
  }

  const deleteBtn = event.target.closest('.delete-btn');
  if (deleteBtn) {
    handleDeleteSingle(deleteBtn.dataset.id);
  }
});

// Edit Modal Events
els.editForm.addEventListener('submit', handleEditSubmit);
els.editStartLine.addEventListener('input', updateEditPreview);
els.editEndLine.addEventListener('input', updateEditPreview);
els.closeEditModal.addEventListener('click', closeEditModal);
els.cancelEditBtn.addEventListener('click', closeEditModal);
els.editModal.addEventListener('click', (e) => {
  if (e.target === els.editModal) closeEditModal();
});

// Confirm Modal Events
els.confirmRemoveAllBtn.addEventListener('click', handleRemoveAll);
els.closeConfirmModal.addEventListener('click', closeConfirmModal);
els.cancelRemoveAllBtn.addEventListener('click', closeConfirmModal);
els.confirmModal.addEventListener('click', (e) => {
  if (e.target === els.confirmModal) closeConfirmModal();
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEditModal();
    closeConfirmModal();
  }
});

// Start application
initSupabase();