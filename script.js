// ============================
// CONFIG
// ============================
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api/analyze"
    : "https://resume-analyser-yjb7.onrender.com/api/analyze";

const MODEL = 'openai/gpt-3.5-turbo';

let resumeText = '';
let currentFile = null;
let isReading = false;

// ============================
// DOM ELEMENTS
// ============================
const fileInput      = document.getElementById('fileInput');
const filePreview    = document.getElementById('filePreview');
const fileName       = document.getElementById('fileName');
const fileSize       = document.getElementById('fileSize');
const removeFile     = document.getElementById('removeFile');
const analyzeBtn     = document.getElementById('analyzeBtn');
const uploadZone     = document.getElementById('uploadZone');
const loading        = document.getElementById('loading');
const results        = document.getElementById('results');
const errorBox       = document.getElementById('errorBox');
const jobDesc        = document.getElementById('jobDesc');

// ============================
// Drag & Drop
// ============================
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () =>
  uploadZone.classList.remove('drag-over')
);

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

removeFile.addEventListener('click', () => {
  currentFile = null;
  resumeText = '';
  filePreview.classList.remove('show');
  fileInput.value = '';
  analyzeBtn.disabled = true;
  hideError();
});

// ============================
// Helpers
// ============================
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showError(msg) {
  errorBox.textContent = '⚠️ ' + msg;
  errorBox.classList.add('show');
}

function hideError() {
  errorBox.classList.remove('show');
}

// ============================
// VALIDATION
// ============================
function validateResumeText(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false };
  }

  const cleaned = text.replace(/[^\w\s]/gi, ' ').trim();
  const wordCount = cleaned.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount < 20) {
    return { valid: false, error: 'Invalid Resume' };
  }

  const lower = text.toLowerCase();
  const sections = ['skills', 'education', 'experience', 'projects'];

  let found = 0;
  for (const s of sections) {
    if (lower.includes(s)) found++;
  }

  return found >= 2
    ? { valid: true }
    : { valid: false, error: 'Invalid Resume Format' };
}

// ============================
// FILE HANDLING
// ============================
async function handleFile(file) {
  const allowedExts = ['pdf', 'doc', 'docx', 'txt'];
  const ext = file.name.split('.').pop().toLowerCase();

  if (!allowedExts.includes(ext)) {
    showError('Unsupported file type');
    return;
  }

  isReading = true;
  analyzeBtn.disabled = true;

  currentFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  filePreview.classList.add('show');

  try {
    resumeText = await file.text();
    analyzeBtn.disabled = resumeText.length > 0 ? false : true;
  } catch (err) {
    showError('File read failed');
  } finally {
    isReading = false;
  }
}

// ============================
// ANALYZE BUTTON
// ============================
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!resumeText) {
    showError('Upload resume first');
    return;
  }

  const validation = validateResumeText(resumeText);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  analyzeBtn.disabled = true;
  loading.classList.add('show');
  results.classList.remove('show');

  try {
    const result = await analyzeWithAPI(resumeText, jobDesc.value);
    loading.classList.remove('show');
    displayResults(result);
  } catch (err) {
    loading.classList.remove('show');
    analyzeBtn.disabled = false;
    showError(err.message);
  }
}

// ============================
// API CALL
// ============================
async function analyzeWithAPI(textContent, jobDescription) {

  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      textContent: textContent || "",
      jobDescription: jobDescription || ""
    })
  });

  if (!response.ok) {
    throw new Error('API request failed (' + response.status + ')');
  }

  const data = await response.json();
  return data.result || data;
}

// ============================
// DISPLAY RESULTS
// ============================
function displayResults(data) {

  document.getElementById('atsScore').textContent = (data.ats_score || 0) + '%';
  document.getElementById('strengthScore').textContent = (data.strength_score || 0) + '%';
  document.getElementById('impactScore').textContent = (data.impact_score || 0) + '%';

  document.getElementById('summaryText').textContent =
    data.summary || 'Analysis complete';

  const skillsEl = document.getElementById('skillsFound');
  if (skillsEl) {
    skillsEl.innerHTML = `
      ${(data.skills_found || []).map(s => `<span class="skill-tag">✓ ${s}</span>`).join('')}
      ${(data.skills_missing || []).map(s => `<span class="skill-tag missing">✗ ${s}</span>`).join('')}
      ${(data.skills_suggested || []).map(s => `<span class="skill-tag suggested">+ ${s}</span>`).join('')}
    `;
  }

  results.classList.add('show');
  results.scrollIntoView({ behavior: 'smooth' });
  analyzeBtn.disabled = false;
}