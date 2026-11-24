import {
  buildDuplicateKey,
  calculateInclusiveLines,
  formatRecordLine,
  parseBatchInput,
  parseSrtFile,
  validateRecordFields
} from './parser.js';

// Application State
let supabaseClient = null;
let records = [];
let realtimeChannel = null;
let currentSyncState = 'connecting';
let currentLang = localStorage.getItem('hps_app_lang') === 'my' ? 'my' : 'en';
let currentTheme = localStorage.getItem('hps_app_theme') === 'dark' ? 'dark' : 'light';

// Translations (English & Burmese)
const TRANSLATIONS = {
  en: {
    appSubtitle: 'Shared subtitle range calculator & project tracker by HeinPyaeShine',
    syncConnecting: 'Connecting...',
    syncOnline: 'Live Sync',
    syncError: 'Connection Error',
    syncFailed: 'Sync Failed',
    syncReconnecting: 'Reconnecting...(Need VPN)',
    usersBoard: 'Users Board:',
    switchUser: 'Switch User',
    shareMyLink: 'Share My Link',
    settings: 'Settings',
    totalLinesLabel: 'TOTAL SUBTITLE LINES',
    savedRecordsLabel: 'SAVED RECORDS',
    addRecordsHeading: 'Add Subtitle Records',
    addRecordsHint: "Separate multiple entries with commas ','",
    batchPlaceholder: 'e.g. Tank Chair Ep7 1-52, etc...',
    addRecordsBtn: 'Add Records',
    uploadSrtBtn: 'Upload .SRT',
    uploadFolderBtn: 'Upload Folder',
    noSrtInFolder: 'No .srt files found inside that folder.',
    helperNoteHtml:
      'Inclusive count supported automatically (e.g. <code>1-52 = 52</code>, <code>131-195 = 65</code>, <code>96-40 = 57</code>). Press <code>Add Records</code> or <code>Upload .SRT</code> to submit.',
    recordsHeading: 'Subtitle Records',
    copyListBtn: 'COPY LIST',
    exportTxtBtn: 'Export TXT',
    removeAllBtn: 'Remove All',
    thSeries: 'Series',
    thEpisode: 'Episode',
    thStart: 'Start',
    thEnd: 'End',
    thTotalLines: 'Total Lines',
    thActions: 'Actions',
    editBtn: 'Edit',
    deleteBtn: 'Delete',
    userModalTitle: 'Switch User Board',
    userModalDesc: 'Enter a user name to open their separate subtitle board and line counter.',
    userNameLabel: 'User Name',
    userNamePlaceholder: 'e.g. HPS, Astral, Ryker',
    recentBoards: 'Recent Boards',
    clearBtn: 'Clear',
    clearListBtn: 'Clear List',
    cancelBtn: 'Cancel',
    openBoardBtn: 'Open Board',
    settingsTitle: 'Settings',
    settingsDesc: 'Customize your Subtitle Line Counter preferences.',
    settingsThemeLabel: 'Appearance',
    themeLightTitle: 'Light Mode',
    themeLightSub: 'Clean bright cards',
    themeDarkTitle: 'Dark Mode',
    themeDarkSub: 'Easy on eyes at night',
    settingsLangLabel: 'Language / ဘာသာစကား',
    settingsSrtLabel: 'SRT File Line Splitter',
    settingsSrtDesc: 'Divide movie lines equally for translators',
    srtFileBtn: 'SRT File',
    splitTotalLabel: 'Total Lines',
    splitFromSrtBtn: 'From .SRT',
    splitTranslatorsLabel: 'Translators (1–20)',
    calcSplitBtn: 'Calculate',
    copyBtn: 'Copy',
    splitInvalidTotal: 'Please enter a valid total line count (1 or more).',
    splitInvalidTranslators: 'Please enter between 1 and 20 translators.',
    splitTooManyTranslators: 'Translators cannot exceed total lines.',
    splitCopied: 'Distribution list copied to clipboard!',
    splitCleared: 'Line splitter cleared.',
    splitLoadedFromSrt: (n) => `Loaded ${n.toLocaleString()} lines from .SRT file.`,
    splitSummary: (total, count, avg) => `${total.toLocaleString()} lines ÷ ${count} (${avg} lines/each)`,
    settingsRecentLabel: 'Recent Boards',
    settingsRecentDesc: 'Clear saved quick-switch chips',
    doneBtn: 'Done',
    editModalTitle: 'Edit Record',
    saveChangesBtn: 'Save Changes',
    confirmModalTitle: 'Remove All Records?',
    confirmRemoveBtn: 'Yes, Remove All',
    dbNotReady: 'Database connection is not ready yet.',
    saveFailed: 'Failed to save records. Please try again.',
    srtSaveFailed: 'Failed to save uploaded SRT records. Please try again.',
    loadFailed: 'Failed to load records from database.',
    deleteFailed: 'Failed to delete record.',
    removeAllFailed: 'Failed to remove all records.',
    updateFailed: 'Failed to update record. Please try again.',
    recordDeleted: 'Record deleted.',
    recordUpdated: 'Record updated.',
    allRemoved: 'All records removed.',
    recentCleared: 'Recent boards cleared.',
    listCopied: 'Subtitle list copied to clipboard!',
    copyFailed: 'Could not copy to clipboard.',
    txtDownloaded: 'TXT file downloaded.',
    enterUserError: 'Please enter a user name.',
    recordsAdded: (n) => (n === 1 ? '1 record added.' : `${n} records added.`),
    srtAdded: (n) => (n === 1 ? '1 SRT file added.' : `${n} SRT files added.`),
    openedBoard: (name) => `Opened ${name}'s board`,
    copiedLink: (name) => `Copied link for ${name}!`
  },
  my: {
    appSubtitle: 'စာတန်းထိုး လိုင်းအရေအတွက် တွက်ချက်မှုနှင့် မှတ်တမ်းစနစ် (by HeinPyaeShine)',
    syncConnecting: 'ချိတ်ဆက်နေသည်...',
    syncOnline: 'တိုက်ရိုက်ချိတ်ဆက်ပြီး',
    syncError: 'ချိတ်ဆက်မှု မအောင်မြင်ပါ',
    syncFailed: 'ဒေတာရယူမှု မအောင်မြင်ပါ',
    syncReconnecting: 'ပြန်လည်ချိတ်ဆက်နေသည်... (VPN လိုအပ်ပါသည်)',
    usersBoard: 'အသုံးပြုသူ ဘုတ်:',
    switchUser: 'အသုံးပြုသူ ပြောင်းရန်',
    shareMyLink: 'လင့်ခ် ကူးယူရန်',
    settings: 'ဆက်တင်',
    totalLinesLabel: 'စုစုပေါင်း စာတန်းလိုင်း',
    savedRecordsLabel: 'သိမ်းဆည်းထားသော မှတ်တမ်း',
    addRecordsHeading: 'စာတန်းထိုး မှတ်တမ်းအသစ် ထည့်ရန်',
    addRecordsHint: "တစ်ခုထက်ပိုပါက ကော်မာ ',' ခံ၍ ရေးပါ",
    batchPlaceholder: 'ဥပမာ - Tank Chair Ep7 1-52 စသည်ဖြင့်...',
    addRecordsBtn: 'မှတ်တမ်းထည့်မည်',
    uploadSrtBtn: '.SRT ဖိုင်တင်မည်',
    uploadFolderBtn: 'ဖိုင်တွဲ (Folder) တင်မည်',
    noSrtInFolder: 'ရွေးချယ်ထားသော ဖိုင်တွဲအတွင်း .srt ဖိုင် မတွေ့ပါ။',
    helperNoteHtml:
      'အစ-အဆုံး လိုင်းအရေအတွက်ကို အလိုအလျောက် တွက်ချက်ပေးပါသည် (ဥပမာ <code>1-52 = 52</code>, <code>131-195 = 65</code>, <code>96-40 = 57</code>)။ ထည့်သွင်းရန် <code>မှတ်တမ်းထည့်မည်</code> သို့မဟုတ် <code>.SRT ဖိုင်တင်မည်</code> ကို နှိပ်ပါ။',
    recordsHeading: 'စာတန်းထိုး မှတ်တမ်းများ',
    copyListBtn: 'စာရင်းကူးယူမည်',
    exportTxtBtn: 'TXT ဖိုင်ထုတ်မည်',
    removeAllBtn: 'အားလုံးဖျက်မည်',
    thSeries: 'ဇာတ်လမ်းအမည်',
    thEpisode: 'အပိုင်း',
    thStart: 'အစ',
    thEnd: 'အဆုံး',
    thTotalLines: 'စုစုပေါင်းလိုင်း',
    thActions: 'လုပ်ဆောင်ချက်',
    editBtn: 'ပြင်ဆင်မည်',
    deleteBtn: 'ဖျက်မည်',
    userModalTitle: 'အသုံးပြုသူ ဘုတ် ပြောင်းရန်',
    userModalDesc: 'သီးခြား စာတန်းထိုး မှတ်တမ်းဘုတ် ဖွင့်ရန် အသုံးပြုသူအမည် ထည့်ပါ။',
    userNameLabel: 'အသုံးပြုသူ အမည်',
    userNamePlaceholder: 'ဥပမာ - HPS, Astral, Ryker',
    recentBoards: 'မကြာသေးမီက ဖွင့်ခဲ့သော ဘုတ်များ',
    clearBtn: 'ရှင်းလင်းမည်',
    clearListBtn: 'စာရင်းရှင်းမည်',
    cancelBtn: 'မလုပ်တော့ပါ',
    openBoardBtn: 'ဘုတ်ဖွင့်မည်',
    settingsTitle: 'ဆက်တင်များ',
    settingsDesc: 'Subtitle Line Counter အသုံးပြုမှု ပုံစံကို စိတ်ကြိုက်ပြင်ဆင်ပါ။',
    settingsThemeLabel: 'အရောင်ပုံစံ (Theme)',
    themeLightTitle: 'အလင်းရောင်စနစ် (Light)',
    themeLightSub: 'နေ့ဘက် အသုံးပြုရန်',
    themeDarkTitle: 'အမှောင်ရောင်စနစ် (Dark)',
    themeDarkSub: 'ညဘက် မျက်စိသက်သာစေရန်',
    settingsLangLabel: 'Language / ဘာသာစကား',
    settingsSrtLabel: 'SRT ဖိုင် လိုင်းခွဲဝေရန်',
    settingsSrtDesc: 'ရုပ်ရှင်စာတန်းလိုင်းများကို ဘာသာပြန်သူများထံ အညီအမျှခွဲဝေရန်',
    srtFileBtn: 'SRT ဖိုင်',
    splitTotalLabel: 'စုစုပေါင်း လိုင်း',
    splitFromSrtBtn: '.SRT မှယူမည်',
    splitTranslatorsLabel: 'ဘာသာပြန်သူ (၁–၂၀)',
    calcSplitBtn: 'တွက်ချက်မည်',
    copyBtn: 'ကူးယူမည်',
    splitInvalidTotal: 'စုစုပေါင်း လိုင်းအရေအတွက် မှန်ကန်စွာ ထည့်သွင်းပါ (၁ နှင့်အထက်)။',
    splitInvalidTranslators: 'ဘာသာပြန်သူ အရေအတွက် ၁ မှ ၂၀ အတွင်း ထည့်သွင်းပါ။',
    splitTooManyTranslators: 'ဘာသာပြန်သူ အရေအတွက်သည် စုစုပေါင်းလိုင်းထက် မများရပါ။',
    splitCopied: 'လိုင်းခွဲဝေမှု စာရင်းကို ကူးယူပြီးပါပြီ!',
    splitCleared: 'လိုင်းခွဲဝေမှု စာရင်း ရှင်းလင်းပြီးပါပြီ။',
    splitLoadedFromSrt: (n) => `.SRT ဖိုင်မှ လိုင်းပေါင်း ${n.toLocaleString()} ရယူပြီးပါပြီ။`,
    splitSummary: (total, count, avg) => `စုစုပေါင်း ${total.toLocaleString()} လိုင်း ÷ ${count} ဦး (တစ်ဦးလျှင် ~${avg} လိုင်း)`,
    settingsRecentLabel: 'မကြာသေးမီက ဘုတ်များ',
    settingsRecentDesc: 'အမြန်ပြောင်းရန် သိမ်းထားသော အမည်များကို ဖျက်မည်',
    doneBtn: 'ပြီးပါပြီ',
    editModalTitle: 'မှတ်တမ်း ပြင်ဆင်ရန်',
    saveChangesBtn: 'ပြင်ဆင်မှု သိမ်းမည်',
    confirmModalTitle: 'မှတ်တမ်းအားလုံး ဖျက်မည်လား?',
    confirmRemoveBtn: 'အားလုံးဖျက်မည်',
    dbNotReady: 'ဒေတာဘေ့စ် ချိတ်ဆက်မှု အဆင်သင့်မဖြစ်သေးပါ။',
    saveFailed: 'မှတ်တမ်းသိမ်းဆည်းမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
    srtSaveFailed: 'SRT ဖိုင် သိမ်းဆည်းမှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
    loadFailed: 'ဒေတာဘေ့စ်မှ မှတ်တမ်းများ ရယူ၍မရပါ။',
    deleteFailed: 'မှတ်တမ်းဖျက်မှု မအောင်မြင်ပါ။',
    removeAllFailed: 'မှတ်တမ်းအားလုံး ဖျက်မှု မအောင်မြင်ပါ။',
    updateFailed: 'မှတ်တမ်းပြင်ဆင်မှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
    recordDeleted: 'မှတ်တမ်း ဖျက်ပြီးပါပြီ။',
    recordUpdated: 'မှတ်တမ်း ပြင်ဆင်ပြီးပါပြီ။',
    allRemoved: 'မှတ်တမ်းအားလုံး ဖျက်ပြီးပါပြီ။',
    recentCleared: 'မကြာသေးမီက ဘုတ်စာရင်း ရှင်းလင်းပြီးပါပြီ။',
    listCopied: 'စာတန်းထိုး စာရင်းကို ကူးယူပြီးပါပြီ!',
    copyFailed: 'စာရင်းကူးယူ၍ မရပါ။',
    txtDownloaded: 'TXT ဖိုင် ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။',
    enterUserError: 'အသုံးပြုသူ အမည် ထည့်သွင်းပါ။',
    recordsAdded: (n) => (n === 1 ? 'မှတ်တမ်း ၁ ခု ထည့်ပြီးပါပြီ။' : `မှတ်တမ်း ${n} ခု ထည့်ပြီးပါပြီ။`),
    srtAdded: (n) => (n === 1 ? 'SRT ဖိုင် ၁ ဖိုင် ထည့်ပြီးပါပြီ။' : `SRT ဖိုင် ${n} ဖိုင် ထည့်ပြီးပါပြီ။`),
    openedBoard: (name) => `${name} ၏ ဘုတ်ကို ဖွင့်လိုက်ပါပြီ`,
    copiedLink: (name) => `${name} အတွက် လင့်ခ် ကူးယူပြီးပါပြီ!`
  }
};

function t(key, ...args) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const val = dict[key] !== undefined ? dict[key] : TRANSLATIONS.en[key];
  return typeof val === 'function' ? val(...args) : val;
}

// Separate board per user
function getInitialUserState() {
  const params = new URLSearchParams(window.location.search);
  const urlUser = (params.get('user') || '').trim();
  if (urlUser) {
    localStorage.setItem('hps_player_name', urlUser);
    return { name: urlUser, isNewVisitor: false };
  }
  const saved = (localStorage.getItem('hps_player_name') || '').trim();
  if (saved) {
    return { name: saved, isNewVisitor: false };
  }
  return { name: 'HPS', isNewVisitor: true };
}

const initialUserState = getInitialUserState();
let currentPlayer = initialUserState.name;

// DOM Elements
const els = {
  syncStatus: document.getElementById('syncStatus'),
  syncText: document.querySelector('#syncStatus .sync-text'),
  grandTotal: document.getElementById('grandTotal'),
  recordCount: document.getElementById('recordCount'),
  recordForm: document.getElementById('recordForm'),
  batchInput: document.getElementById('batchInput'),
  addBtn: document.getElementById('addBtn'),
  srtFileInput: document.getElementById('srtFileInput'),
  uploadSrtBtn: document.getElementById('uploadSrtBtn'),
  folderFileInput: document.getElementById('folderFileInput'),
  uploadFolderBtn: document.getElementById('uploadFolderBtn'),
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
   Utilities, Theme & Language Switcher
   ========================================= */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML.replace(/"/g, '"');
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

function setSyncStatus(state, labelKey) {
  currentSyncState = state;
  els.syncStatus.classList.remove('is-online', 'is-error');
  if (state === 'online') els.syncStatus.classList.add('is-online');
  if (state === 'error') els.syncStatus.classList.add('is-error');
  els.syncText.textContent = t(labelKey);
}

function applyTheme(theme) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('hps_app_theme', currentTheme);
  document.body.classList.toggle('theme-dark', currentTheme === 'dark');

  document.getElementById('themeLightBtn')?.classList.toggle('is-selected', currentTheme === 'light');
  document.getElementById('themeDarkBtn')?.classList.toggle('is-selected', currentTheme === 'dark');

  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.name = 'theme-color';
    document.head.appendChild(metaTheme);
  }
  metaTheme.content = currentTheme === 'dark' ? '#0b1120' : '#f8fafc';
}

function applyLanguage(lang) {
  currentLang = lang === 'my' ? 'my' : 'en';
  localStorage.setItem('hps_app_lang', currentLang);
  document.documentElement.lang = currentLang;
  document.body.classList.toggle('lang-my', currentLang === 'my');

  // Header subtitle & sync status
  const subtitleEl = document.querySelector('header p, .brand-subtitle, .app-subtitle');
  if (subtitleEl) subtitleEl.textContent = t('appSubtitle');

  if (currentSyncState === 'online') els.syncText.textContent = t('syncOnline');
  else if (currentSyncState === 'error') els.syncText.textContent = t('syncError');
  else if (currentSyncState === 'reconnecting') els.syncText.textContent = t('syncReconnecting');
  else els.syncText.textContent = t('syncConnecting');

  // User Board Bar
  const badgeEl = document.getElementById('currentPlayerBadge');
  if (badgeEl && badgeEl.previousElementSibling) {
    badgeEl.previousElementSibling.textContent = t('usersBoard');
  }
  const switchBtnEl = document.getElementById('switchPlayerBtn');
  if (switchBtnEl) switchBtnEl.textContent = t('switchUser');
  const shareBtnEl = document.getElementById('shareBoardBtn');
  if (shareBtnEl) shareBtnEl.textContent = t('shareMyLink');
  const settingsBtnTextEl = document.getElementById('settingsBtnText');
  if (settingsBtnTextEl) settingsBtnTextEl.textContent = t('settings');

  // Summary Cards
  const summaryLabels = document.querySelectorAll('.summary-label');
  if (summaryLabels[0]) summaryLabels[0].textContent = t('totalLinesLabel');
  if (summaryLabels[1]) summaryLabels[1].textContent = t('savedRecordsLabel');

  // Add Records Form
  const fieldLabel = document.querySelector('label[for="batchInput"]');
  if (fieldLabel && fieldLabel.firstChild) {
    fieldLabel.firstChild.textContent = t('addRecordsHeading') + ' ';
  }
  const fieldHint = document.querySelector('.field-hint');
  if (fieldHint) fieldHint.textContent = t('addRecordsHint');
  if (els.batchInput) els.batchInput.placeholder = t('batchPlaceholder');

  const addBtnSpan = els.addBtn?.querySelector('span');
  if (addBtnSpan) addBtnSpan.textContent = t('addRecordsBtn');
  const uploadBtnSpan = els.uploadSrtBtn?.querySelector('span');
  if (uploadBtnSpan) uploadBtnSpan.textContent = t('uploadSrtBtn');
  const folderBtnSpan = els.uploadFolderBtn?.querySelector('span');
  if (folderBtnSpan) folderBtnSpan.textContent = t('uploadFolderBtn');

  const helperNote = document.querySelector('.helper-note');
  if (helperNote) helperNote.innerHTML = t('helperNoteHtml');

  // Records Section & Table Headers
  const recordsSectionHeading = document.querySelector('.records-section h2, .card:last-of-type h2');
  if (recordsSectionHeading && recordsSectionHeading.id !== 'userModalTitle' && recordsSectionHeading.id !== 'settingsModalTitle') {
    recordsSectionHeading.textContent = t('recordsHeading');
  }

  const copySpan = els.copyListBtn?.querySelector('span');
  if (copySpan) copySpan.textContent = t('copyListBtn');
  else if (els.copyListBtn) els.copyListBtn.textContent = t('copyListBtn');

  const exportSpan = els.exportTxtBtn?.querySelector('span');
  if (exportSpan) exportSpan.textContent = t('exportTxtBtn');
  else if (els.exportTxtBtn) els.exportTxtBtn.textContent = t('exportTxtBtn');

  const removeSpan = els.removeAllBtn?.querySelector('span');
  if (removeSpan) removeSpan.textContent = t('removeAllBtn');
  else if (els.removeAllBtn) els.removeAllBtn.textContent = t('removeAllBtn');

  const ths = document.querySelectorAll('#tableWrapper thead th');
  const thKeys = ['thSeries', 'thEpisode', 'thStart', 'thEnd', 'thTotalLines', 'thActions'];
  ths.forEach((th, idx) => {
    if (thKeys[idx]) th.textContent = t(thKeys[idx]);
  });

  // Switch User Modal
  const uTitle = document.getElementById('userModalTitle');
  if (uTitle) uTitle.textContent = t('userModalTitle');
  const uDesc = uTitle?.parentElement?.nextElementSibling;
  if (uDesc && uDesc.tagName === 'P') uDesc.textContent = t('userModalDesc');
  const uLabel = document.querySelector('label[for="userNameInput"]');
  if (uLabel) uLabel.textContent = t('userNameLabel');
  const uInput = document.getElementById('userNameInput');
  if (uInput) uInput.placeholder = t('userNamePlaceholder');
  const recentLabel = document.getElementById('recentBoardsLabel');
  if (recentLabel) recentLabel.textContent = t('recentBoards');
  const clearRecentBtn = document.getElementById('clearRecentUsersBtn');
  if (clearRecentBtn) clearRecentBtn.textContent = t('clearBtn');
  const cancelUserEl = document.getElementById('cancelUserBtn');
  if (cancelUserEl) cancelUserEl.textContent = t('cancelBtn');
  const openBoardEl = document.querySelector('#userForm button[type="submit"]');
  if (openBoardEl) openBoardEl.textContent = t('openBoardBtn');

  // Edit & Confirm Modals
  if (els.cancelEditBtn) els.cancelEditBtn.textContent = t('cancelBtn');
  if (els.saveEditBtn) els.saveEditBtn.textContent = t('saveChangesBtn');
  if (els.cancelRemoveAllBtn) els.cancelRemoveAllBtn.textContent = t('cancelBtn');
  if (els.confirmRemoveAllBtn) els.confirmRemoveAllBtn.textContent = t('confirmRemoveBtn');

  // Settings Modal (Theme, Language, SRT Splitter & Recent Boards)
  const sTitle = document.getElementById('settingsModalTitle');
  if (sTitle) sTitle.textContent = t('settingsTitle');
  const sDesc = document.getElementById('settingsModalDesc');
  if (sDesc) sDesc.textContent = t('settingsDesc');

  const sThemeLabel = document.getElementById('settingsThemeLabel');
  if (sThemeLabel) sThemeLabel.textContent = t('settingsThemeLabel');
  const lightTitle = document.getElementById('themeLightTitle');
  if (lightTitle) lightTitle.textContent = t('themeLightTitle');
  const lightSub = document.getElementById('themeLightSub');
  if (lightSub) lightSub.textContent = t('themeLightSub');
  const darkTitle = document.getElementById('themeDarkTitle');
  if (darkTitle) darkTitle.textContent = t('themeDarkTitle');
  const darkSub = document.getElementById('themeDarkSub');
  if (darkSub) darkSub.textContent = t('themeDarkSub');

  const sLangLabel = document.getElementById('settingsLangLabel');
  if (sLangLabel) sLangLabel.textContent = t('settingsLangLabel');

  const sSrtLabel = document.getElementById('settingsSrtLabel');
  if (sSrtLabel) sSrtLabel.textContent = t('settingsSrtLabel');
  const sSrtDesc = document.getElementById('settingsSrtDesc');
  if (sSrtDesc) sSrtDesc.textContent = t('settingsSrtDesc');
  const toggleSrtText = document.getElementById('toggleSrtSplitterText');
  if (toggleSrtText) toggleSrtText.textContent = t('srtFileBtn');
  const splitTotalLbl = document.getElementById('splitTotalLabel');
  if (splitTotalLbl) splitTotalLbl.textContent = t('splitTotalLabel');
  const splitFromSrt = document.getElementById('splitLoadSrtBtn');
  if (splitFromSrt) splitFromSrt.textContent = t('splitFromSrtBtn');
  const splitTransLbl = document.getElementById('splitTranslatorsLabel');
  if (splitTransLbl) splitTransLbl.textContent = t('splitTranslatorsLabel');
  const calcSplit = document.getElementById('calcSplitBtn');
  if (calcSplit) calcSplit.textContent = t('calcSplitBtn');
  const clearSplit = document.getElementById('clearSplitBtn');
  if (clearSplit) clearSplit.textContent = t('clearListBtn');
  const copySplit = document.getElementById('copySplitBtn');
  if (copySplit) copySplit.textContent = t('copyBtn');

  const sRecentLabel = document.getElementById('settingsRecentLabel');
  if (sRecentLabel) sRecentLabel.textContent = t('settingsRecentLabel');
  const sRecentDesc = document.getElementById('settingsRecentDesc');
  if (sRecentDesc) sRecentDesc.textContent = t('settingsRecentDesc');
  const sClearRecentBtn = document.getElementById('settingsClearRecentBtn');
  if (sClearRecentBtn) sClearRecentBtn.textContent = t('clearListBtn');

  const sDoneBtn = document.getElementById('doneSettingsBtn');
  if (sDoneBtn) sDoneBtn.textContent = t('doneBtn');

  document.getElementById('langEnBtn')?.classList.toggle('is-selected', currentLang === 'en');
  document.getElementById('langMyBtn')?.classList.toggle('is-selected', currentLang === 'my');

  if (records.length > 0) {
    renderRecords();
  }
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
    setSyncStatus('error', 'syncError');
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
    .eq('owner', currentPlayer)
    .order('created_at', { ascending: true });

  els.loadingState.classList.add('hidden');

  if (error) {
    console.error('Fetch error:', error);
    setSyncStatus('error', 'syncFailed');
    showToast(t('loadFailed'), 'error');
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
      (payload) => {
        if (payload.new?.owner && payload.new.owner !== currentPlayer) return;
        fetchRecords();
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('online', 'syncOnline');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        currentSyncState = 'reconnecting';
        els.syncStatus.classList.remove('is-online');
        els.syncStatus.classList.add('is-error');
        els.syncText.textContent = t('syncReconnecting');
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
          <td data-label="${escapeHtml(t('thSeries'))}">
            <span class="project-name">${escapeHtml(rec.project_name)}</span>
          </td>
          <td data-label="${escapeHtml(t('thEpisode'))}">${epDisplay}</td>
          <td data-label="${escapeHtml(t('thStart'))}" class="num-col">${Number(rec.start_line).toLocaleString()}</td>
          <td data-label="${escapeHtml(t('thEnd'))}" class="num-col">${Number(rec.end_line).toLocaleString()}</td>
          <td data-label="${escapeHtml(t('thTotalLines'))}" class="num-col">
            <span class="lines-pill">${Number(rec.total_lines).toLocaleString()}</span>
          </td>
          <td data-label="${escapeHtml(t('thActions'))}" class="actions-col">
            <div class="row-actions">
              <button type="button" class="btn btn-secondary btn-sm edit-btn" data-id="${escapeHtml(rec.id)}">${escapeHtml(t('editBtn'))}</button>
              <button type="button" class="btn btn-danger-outline btn-sm delete-btn" data-id="${escapeHtml(rec.id)}">${escapeHtml(t('deleteBtn'))}</button>
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
    showFormError([t('dbNotReady')]);
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
    .insert(validRecords.map((r) => ({ ...r, owner: currentPlayer })))
    .select();

  els.addBtn.disabled = false;

  if (error) {
    console.error('Insert error:', error);
    showFormError([t('saveFailed')]);
    return;
  }

  if (data && data.length > 0) {
    const existingIds = new Set(records.map((r) => r.id));
    data.forEach((item) => {
      if (!existingIds.has(item.id)) records.push(item);
    });
    renderRecords();
  }

  els.batchInput.value = '';
  els.batchInput.focus();
  showToast(t('recordsAdded', validRecords.length), 'success');
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
    .eq('owner', currentPlayer)
    .eq('id', id)
    .select()
    .single();

  els.saveEditBtn.disabled = false;

  if (error) {
    console.error('Update error:', error);
    els.editError.textContent = t('updateFailed');
    els.editError.classList.remove('hidden');
    return;
  }

  records = records.map((r) => (r.id === id ? data : r));
  renderRecords();
  closeEditModal();
  showToast(t('recordUpdated'), 'success');
}

/* =========================================
   Delete Single & Remove All
   ========================================= */
async function handleDeleteSingle(id) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from('subtitle_records')
    .delete()
    .eq('owner', currentPlayer)
    .eq('id', id);

  if (error) {
    console.error('Delete error:', error);
    showToast(t('deleteFailed'), 'error');
    return;
  }

  records = records.filter((r) => r.id !== id);
  renderRecords();
  showToast(t('recordDeleted'), 'success');
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

  const { error } = await supabaseClient
    .from('subtitle_records')
    .delete()
    .eq('owner', currentPlayer)
    .not('id', 'is', null);

  els.confirmRemoveAllBtn.disabled = false;

  if (error) {
    console.error('Remove all error:', error);
    showToast(t('removeAllFailed'), 'error');
    return;
  }

  records = [];
  renderRecords();
  closeConfirmModal();
  showToast(t('allRemoved'), 'success');
}

/* =========================================
   Copy List & Export TXT
   ========================================= */
function buildFormattedReport() {
  const lines = records.map(formatRecordLine);
  const grandTotal = computeGrandTotal();
  return ['SUBTITLE RECORDS', ...lines, `TOTAL = ${grandTotal}`].join('\n');
}

async function copyTextToClipboard(text) {
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
}

async function handleCopyList() {
  if (records.length === 0) return;
  try {
    await copyTextToClipboard(buildFormattedReport());
    showToast(t('listCopied'), 'success');
  } catch (err) {
    console.error('Clipboard copy error:', err);
    showToast(t('copyFailed'), 'error');
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

  showToast(t('txtDownloaded'), 'success');
}

/* =========================================
   SRT File & Folder Upload
   ========================================= */
async function handleSrtFilesSelected(event) {
  const isFolderUpload = event.target === els.folderFileInput;
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (files.length === 0) return;

  showFormError([]);
  if (!supabaseClient) {
    showFormError([t('dbNotReady')]);
    return;
  }

  const activeBtn = isFolderUpload ? els.uploadFolderBtn : els.uploadSrtBtn;
  const activeSpan = activeBtn?.querySelector('span');

  if (els.uploadSrtBtn) els.uploadSrtBtn.disabled = true;
  if (els.uploadFolderBtn) els.uploadFolderBtn.disabled = true;
  if (activeSpan) {
    activeSpan.textContent = currentLang === 'my' ? 'ဖိုင်များ ဖတ်နေသည်...' : 'Reading files...';
  }

  try {
    const existingKeys = new Set(records.map(buildDuplicateKey));
    const batchKeys = new Set();
    const validRecords = [];
    const errors = [];
    const srtItems = [];

    // Collect .srt files from individual picks or an entire folder
    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      const relPath = file.webkitRelativePath || '';

      // Skip hidden system files inside folders
      if (file.name.startsWith('.') || relPath.includes('__MACOSX')) continue;

      if (!lowerName.endsWith('.srt')) {
        // When scanning a mixed folder like Telegram, silently ignore images/videos/other files
        if (!isFolderUpload) {
          errors.push(`Skipped "${file.name}": only .srt files are supported.`);
        }
        continue;
      }

      const content = await file.text();
      srtItems.push({ name: file.name, content });
    }

    if (isFolderUpload && srtItems.length === 0) {
      errors.push(t('noSrtInFolder'));
    }

    // Parse and validate every collected .srt file
    for (const item of srtItems) {
      const result = parseSrtFile(item.name, item.content);

      if (!result.valid) {
        errors.push(result.error);
        continue;
      }

      const key = buildDuplicateKey(result.record);
      if (existingKeys.has(key)) {
        errors.push(`Duplicate skipped: "${formatRecordLine(result.record)}" already exists.`);
        continue;
      }
      if (batchKeys.has(key)) {
        errors.push(`Duplicate file skipped: "${item.name}".`);
        continue;
      }

      batchKeys.add(key);
      validRecords.push(result.record);
    }

    // Save to Supabase in batches of 50 with live progress
    if (validRecords.length > 0) {
      const existingIds = new Set(records.map((r) => r.id));
      let savedCount = 0;
      const CHUNK_SIZE = 50;

      for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
        const chunk = validRecords
          .slice(i, i + CHUNK_SIZE)
          .map((r) => ({ ...r, owner: currentPlayer }));

        if (activeSpan) {
          const done = Math.min(i + CHUNK_SIZE, validRecords.length);
          activeSpan.textContent = `${done} / ${validRecords.length}...`;
        }

        const { data, error } = await supabaseClient
          .from('subtitle_records')
          .insert(chunk)
          .select();

        if (error) {
          console.error('SRT insert error:', error);
          errors.push(t('srtSaveFailed'));
          break;
        }

        if (data && data.length > 0) {
          data.forEach((row) => {
            if (!existingIds.has(row.id)) {
              existingIds.add(row.id);
              records.push(row);
              savedCount++;
            }
          });
        }
      }

      if (savedCount > 0) {
        renderRecords();
        showToast(t('srtAdded', savedCount), 'success');
      }
    }

    if (errors.length > 0) {
      showFormError(errors);
    }
  } finally {
    if (els.uploadSrtBtn) {
      els.uploadSrtBtn.disabled = false;
      const s = els.uploadSrtBtn.querySelector('span');
      if (s) s.textContent = t('uploadSrtBtn');
    }
    if (els.uploadFolderBtn) {
      els.uploadFolderBtn.disabled = false;
      const f = els.uploadFolderBtn.querySelector('span');
      if (f) f.textContent = t('uploadFolderBtn');
    }
  }
}

if (els.srtFileInput) els.srtFileInput.multiple = true;
els.uploadSrtBtn.addEventListener('click', () => {
  els.srtFileInput.multiple = true;
  els.srtFileInput.click();
});
els.srtFileInput.addEventListener('change', handleSrtFilesSelected);

if (els.uploadFolderBtn && els.folderFileInput) {
  els.uploadFolderBtn.addEventListener('click', () => els.folderFileInput.click());
  els.folderFileInput.addEventListener('change', handleSrtFilesSelected);
}

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

// Custom User Board Modal & Share Link
const playerBadge = document.getElementById('currentPlayerBadge');
const switchPlayerBtn = document.getElementById('switchPlayerBtn');
const shareBoardBtn = document.getElementById('shareBoardBtn');
const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
const userNameInput = document.getElementById('userNameInput');
const userError = document.getElementById('userError');
const recentUsersSection = document.getElementById('recentUsersSection');
const recentUsersList = document.getElementById('recentUsersList');
const clearRecentUsersBtn = document.getElementById('clearRecentUsersBtn');
const settingsClearRecentBtn = document.getElementById('settingsClearRecentBtn');
const closeUserModalBtn = document.getElementById('closeUserModal');
const cancelUserBtn = document.getElementById('cancelUserBtn');

function getRecentUsers() {
  try {
    const raw = JSON.parse(localStorage.getItem('hps_recent_users') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function updateClearRecentButtons() {
  const hasRecent = getRecentUsers().length > 0;
  if (settingsClearRecentBtn) settingsClearRecentBtn.disabled = !hasRecent;
}

function saveRecentUser(name) {
  const list = getRecentUsers().filter((u) => u.toLowerCase() !== name.toLowerCase());
  list.unshift(name);
  localStorage.setItem('hps_recent_users', JSON.stringify(list.slice(0, 8)));
  updateClearRecentButtons();
}

function clearRecentUsers() {
  localStorage.setItem('hps_recent_users', JSON.stringify([]));
  renderRecentUserChips();
  updateClearRecentButtons();
  showToast(t('recentCleared'), 'success');
}

saveRecentUser(currentPlayer);
if (playerBadge) playerBadge.textContent = currentPlayer;

function renderRecentUserChips() {
  if (!recentUsersList || !recentUsersSection) return;
  const recent = getRecentUsers();
  if (recent.length === 0) {
    recentUsersSection.classList.add('hidden');
    return;
  }
  recentUsersSection.classList.remove('hidden');
  recentUsersList.innerHTML = recent
    .map((name) => {
      const isCurrent = name.toLowerCase() === currentPlayer.toLowerCase();
      return `<button type="button" class="user-chip ${isCurrent ? 'is-active' : ''}" data-user="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
    })
    .join('');
}

function openUserModal(isFirstVisit = false) {
  if (!userModal || !userNameInput) return;
  userError.classList.add('hidden');
  userNameInput.value = isFirstVisit ? '' : currentPlayer;
  renderRecentUserChips();
  userModal.classList.remove('hidden');
  setTimeout(() => {
    userNameInput.focus();
    if (!isFirstVisit) userNameInput.select();
  }, 30);
}

function closeUserModal() {
  if (userModal) userModal.classList.add('hidden');
}

async function switchToUserBoard(rawName) {
  const cleanName = rawName.trim();
  if (!cleanName) {
    userError.textContent = t('enterUserError');
    userError.classList.remove('hidden');
    userNameInput.focus();
    return;
  }

  currentPlayer = cleanName;
  localStorage.setItem('hps_player_name', cleanName);
  saveRecentUser(cleanName);
  if (playerBadge) playerBadge.textContent = cleanName;

  const url = new URL(window.location.href);
  url.searchParams.set('user', cleanName);
  window.history.replaceState({}, '', url.toString());

  closeUserModal();
  records = [];
  els.loadingState.classList.remove('hidden');
  els.tableWrapper.classList.add('hidden');
  els.emptyState.classList.add('hidden');

  await fetchRecords();
  showToast(t('openedBoard', cleanName), 'success');
}

if (switchPlayerBtn) {
  switchPlayerBtn.addEventListener('click', () => openUserModal(false));
}

if (userForm) {
  userForm.addEventListener('submit', (e) => {
    e.preventDefault();
    switchToUserBoard(userNameInput.value);
  });
}

if (recentUsersList) {
  recentUsersList.addEventListener('click', (e) => {
    const chip = e.target.closest('.user-chip');
    if (chip && chip.dataset.user) {
      switchToUserBoard(chip.dataset.user);
    }
  });
}

if (clearRecentUsersBtn) clearRecentUsersBtn.addEventListener('click', clearRecentUsers);
if (settingsClearRecentBtn) settingsClearRecentBtn.addEventListener('click', clearRecentUsers);
if (closeUserModalBtn) closeUserModalBtn.addEventListener('click', closeUserModal);
if (cancelUserBtn) cancelUserBtn.addEventListener('click', closeUserModal);
if (userModal) {
  userModal.addEventListener('click', (e) => {
    if (e.target === userModal) closeUserModal();
  });
}

if (shareBoardBtn) {
  shareBoardBtn.addEventListener('click', async () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('user', currentPlayer);
    try {
      await copyTextToClipboard(url.toString());
      showToast(t('copiedLink', currentPlayer), 'success');
    } catch {
      showToast(`Link: ${url.toString()}`, 'default');
    }
  });
}

// Settings Modal Events (Theme, Language, SRT Line Splitter & Reset)
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModal');
const doneSettingsBtn = document.getElementById('doneSettingsBtn');
const themeLightBtn = document.getElementById('themeLightBtn');
const themeDarkBtn = document.getElementById('themeDarkBtn');
const langEnBtn = document.getElementById('langEnBtn');
const langMyBtn = document.getElementById('langMyBtn');

// SRT File Line Splitter Elements
const toggleSrtSplitterBtn = document.getElementById('toggleSrtSplitterBtn');
const srtSplitterPanel = document.getElementById('srtSplitterPanel');
const splitTotalLinesInput = document.getElementById('splitTotalLinesInput');
const splitLoadSrtBtn = document.getElementById('splitLoadSrtBtn');
const splitLoadSrtInput = document.getElementById('splitLoadSrtInput');
const splitTranslatorsInput = document.getElementById('splitTranslatorsInput');
const splitPresetRow = document.getElementById('splitPresetRow');
const splitError = document.getElementById('splitError');
const calcSplitBtn = document.getElementById('calcSplitBtn');
const clearSplitBtn = document.getElementById('clearSplitBtn');
const splitResultBox = document.getElementById('splitResultBox');
const splitSummaryBadge = document.getElementById('splitSummaryBadge');
const copySplitBtn = document.getElementById('copySplitBtn');
const splitOutputText = document.getElementById('splitOutputText');

function syncSplitPresetPills() {
  if (!splitPresetRow || !splitTranslatorsInput) return;
  const val = String(splitTranslatorsInput.value || '').trim();
  splitPresetRow.querySelectorAll('.split-preset-pill').forEach((pill) => {
    pill.classList.toggle('is-active', pill.dataset.count === val);
  });
}

function clearLineSplit() {
  if (splitTotalLinesInput) splitTotalLinesInput.value = '';
  if (splitTranslatorsInput) splitTranslatorsInput.value = '';
  syncSplitPresetPills();
  if (splitError) {
    splitError.textContent = '';
    splitError.classList.add('hidden');
  }
  if (splitOutputText) splitOutputText.textContent = '';
  if (splitSummaryBadge) splitSummaryBadge.textContent = '';
  if (splitResultBox) splitResultBox.classList.add('hidden');
  showToast(t('splitCleared'), 'success');
}

function calculateEqualLineSplit() {
  if (!splitTotalLinesInput || !splitTranslatorsInput) return;
  splitError.classList.add('hidden');

  const totalLines = Number(splitTotalLinesInput.value);
  const translators = Number(splitTranslatorsInput.value);

  if (!Number.isInteger(totalLines) || totalLines < 1) {
    splitError.textContent = t('splitInvalidTotal');
    splitError.classList.remove('hidden');
    splitResultBox.classList.add('hidden');
    splitTotalLinesInput.focus();
    return;
  }

  if (!Number.isInteger(translators) || translators < 1 || translators > 20) {
    splitError.textContent = t('splitInvalidTranslators');
    splitError.classList.remove('hidden');
    splitResultBox.classList.add('hidden');
    splitTranslatorsInput.focus();
    return;
  }

  if (translators > totalLines) {
    splitError.textContent = t('splitTooManyTranslators');
    splitError.classList.remove('hidden');
    splitResultBox.classList.add('hidden');
    splitTranslatorsInput.focus();
    return;
  }

  const baseCount = Math.floor(totalLines / translators);
  const remainder = totalLines % translators;
  const rows = [];
  let cursor = 1;

  for (let i = 0; i < translators; i++) {
    const share = baseCount + (i < remainder ? 1 : 0);
    const start = cursor;
    const end = cursor + share - 1;
    const rangeLabel = `${start}-${end}`.padEnd(11, ' ');
    rows.push(`${rangeLabel}@`);
    cursor = end + 1;
  }

  const avgDisplay = remainder === 0 ? `${baseCount}` : `${baseCount}–${baseCount + 1}`;
  splitSummaryBadge.textContent = t('splitSummary', totalLines, translators, avgDisplay);
  splitOutputText.textContent = rows.join('\n');
  splitResultBox.classList.remove('hidden');
}

if (toggleSrtSplitterBtn && srtSplitterPanel) {
  toggleSrtSplitterBtn.addEventListener('click', () => {
    const isHidden = srtSplitterPanel.classList.toggle('hidden');
    if (!isHidden && splitTotalLinesInput) {
      setTimeout(() => splitTotalLinesInput.focus(), 30);
    }
  });
}

if (splitLoadSrtBtn && splitLoadSrtInput) {
  splitLoadSrtBtn.addEventListener('click', () => splitLoadSrtInput.click());
  splitLoadSrtInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const content = await file.text();
    const parsed = parseSrtFile(file.name, content);
    if (parsed.valid && parsed.record?.end_line) {
      splitTotalLinesInput.value = parsed.record.end_line;
      showToast(t('splitLoadedFromSrt', parsed.record.end_line), 'success');
      if (splitTranslatorsInput.value) {
        calculateEqualLineSplit();
      } else {
        splitTranslatorsInput.focus();
      }
    } else {
      splitError.textContent = parsed.error || t('splitInvalidTotal');
      splitError.classList.remove('hidden');
    }
  });
}

if (splitPresetRow) {
  splitPresetRow.addEventListener('click', (e) => {
    const pill = e.target.closest('.split-preset-pill');
    if (!pill || !pill.dataset.count) return;
    splitTranslatorsInput.value = pill.dataset.count;
    syncSplitPresetPills();
    if (splitTotalLinesInput.value) {
      calculateEqualLineSplit();
    } else {
      splitTotalLinesInput.focus();
    }
  });
}

if (splitTranslatorsInput) {
  splitTranslatorsInput.addEventListener('input', syncSplitPresetPills);
  splitTranslatorsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      calculateEqualLineSplit();
    }
  });
}

if (splitTotalLinesInput) {
  splitTotalLinesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!splitTranslatorsInput.value) {
        splitTranslatorsInput.focus();
      } else {
        calculateEqualLineSplit();
      }
    }
  });
}

if (calcSplitBtn) {
  calcSplitBtn.addEventListener('click', calculateEqualLineSplit);
}

if (clearSplitBtn) {
  clearSplitBtn.addEventListener('click', clearLineSplit);
}

if (copySplitBtn) {
  copySplitBtn.addEventListener('click', async () => {
    const text = splitOutputText?.textContent || '';
    if (!text) return;
    try {
      await copyTextToClipboard(text);
      showToast(t('splitCopied'), 'success');
    } catch {
      showToast(t('copyFailed'), 'error');
    }
  });
}

function openSettingsModal() {
  updateClearRecentButtons();
  if (settingsModal) settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  if (settingsModal) settingsModal.classList.add('hidden');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
if (doneSettingsBtn) doneSettingsBtn.addEventListener('click', closeSettingsModal);
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });
}

if (themeLightBtn) {
  themeLightBtn.addEventListener('click', () => applyTheme('light'));
}
if (themeDarkBtn) {
  themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
}

if (langEnBtn) {
  langEnBtn.addEventListener('click', () => applyLanguage('en'));
}
if (langMyBtn) {
  langMyBtn.addEventListener('click', () => applyLanguage('my'));
}

// Close all modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEditModal();
    closeConfirmModal();
    closeUserModal();
    closeSettingsModal();
  }
});

// Apply saved theme & language, then start application
applyTheme(currentTheme);
applyLanguage(currentLang);
initSupabase();
if (initialUserState.isNewVisitor) {
  openUserModal(true);
}
