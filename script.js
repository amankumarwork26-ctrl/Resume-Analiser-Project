// ============================ //
// CONFIG (top pe change karo easily) //
// ============================ //
const API_BASE_URL = "https://resume-analyser-yjb7.onrender.com/api/analyze";
const MODEL = 'openai/gpt-3.5-turbo'; // <-- Model change kar sakte ho (e.g., anthropic/claude-3.5-sonnet)

let resumeText = '';
let currentFile = null;
let isReading = false; // NEW: file read hone tak analyze block rahega

const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadZone = document.getElementById('uploadZone');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const errorBox = document.getElementById('errorBox');
const jobDesc = document.getElementById('jobDesc');

// ============================ //
// Drag & Drop //
// ============================ //
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
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

// "Re-Analyze" button (agar HTML mein hai)
const reAnalyzeBtn = document.getElementById('reAnalyze');
if (reAnalyzeBtn) {
  reAnalyzeBtn.addEventListener('click', () => {
    results.classList.remove('show');
    currentFile = null;
    resumeText = '';
    filePreview.classList.remove('show');
    fileInput.value = '';
    analyzeBtn.disabled = true;
    hideError();
  });
}

// ============================ //
// Helpers //
// ============================ //
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

// ============================ //
// VALIDATION (Pehle check, fir score) //
// ============================ //
function validateResumeText(text) {
  // Step 1: Readable content check
  if (!text || typeof text !== 'string') {
    return { valid: false, error: '❌ Invalid Resume - No readable content found' };
  }
  const cleaned = text.replace(/[^\w\s]/gi, ' ').trim();
  const wordCount = cleaned.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 20) {
    return { valid: false, error: '❌ Invalid Resume - No readable content found' };
  }
  // Step 2: Section structure check (at least 2 required)
  const lower = text.toLowerCase();
  const sectionKeywords = [
    ['skills', 'technical skills', 'core competencies', 'expertise'],
    ['education', 'academic', 'qualification', 'degree', 'university', 'college'],
    ['experience', 'work experience', 'professional experience', 'employment', 'career history', 'internship'],
    ['projects', 'personal projects', 'academic projects', 'key projects']
  ];
  let foundSections = 0;
  for (const group of sectionKeywords) {
    if (group.some(k => lower.includes(k))) {
      foundSections++;
      if (foundSections >= 2) break;
    }
  }
  if (foundSections < 2) {
    return { valid: false, error: '❌ Invalid Resume Format' };
  }
  return { valid: true };
}

// ============================ //
// File Handling (Promise-based) //
// ============================ //
async function handleFile(file) {
  const allowedExts = ['pdf', 'doc', 'docx', 'txt'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!allowedExts.includes(ext)) {
    showError('Unsupported file type. Please upload PDF, DOCX, or TXT.');
    return;
  }
  // Disable analyze while reading
  isReading = true;
  analyzeBtn.disabled = true;
  hideError();
  currentFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  filePreview.classList.add('show');
  try {
    await readFile(file);
    // File read successfully
    if (resumeText && resumeText.length > 0) {
      analyzeBtn.disabled = false;
    } else {
      showError('Could not extract text from file. Try a .txt file.');
      analyzeBtn.disabled = true;
    }
  } catch (err) {
    showError(err.message || 'Failed to read file.');
    analyzeBtn.disabled = true;
  } finally {
    isReading = false;
  }
}

async function readFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'txt') {
    resumeText = await file.text();
    return;
  }

  if (ext === 'pdf') {
    // PDF.js se proper text extraction (pehle readAsText use ho raha tha
    // jo PDF binary ko garbage bana deta tha => "Invalid Resume Format")
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF library load nahi hui. Internet connection check karo ya .txt file upload karo.');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    fullText = fullText.replace(/\s+/g, ' ').trim();
    if (fullText.length < 30) {
      throw new Error('Is PDF se text extract nahi ho paya (scanned/image PDF lagta hai). Text-based PDF ya .txt file upload karo.');
    }
    resumeText = fullText;
    return;
  }

  if (ext === 'docx') {
    // Mammoth se DOCX extraction
    if (typeof mammoth === 'undefined') {
      throw new Error('DOCX library load nahi hui. Internet connection check karo ya .txt file upload karo.');
    }
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result.value || '').trim();
    if (text.length < 30) {
      throw new Error('DOCX se text extract nahi ho paya. .txt ya PDF file try karo.');
    }
    resumeText = text;
    return;
  }

  // Purana .doc format browser me reliably extract nahi hota
  throw new Error('.doc format supported nahi hai. Please .docx, .pdf ya .txt file upload karo.');
}

// ============================ //
// Analysis Flow //
// ============================ //
analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  // Guard: file reading in progress
  if (isReading) {
    showError('Please wait, file is still being read.');
    return;
  }
  if (!currentFile || !resumeText) {
    showError('Please upload a resume first.');
    return;
  }
  // ---- STEP 1 & 2: VALIDATE BEFORE SCORING ----
  const validation = validateResumeText(resumeText);
  if (!validation.valid) {
    showError(validation.error);
    return; // Score calculate NAHI hoga
  }
  // If valid, show success and proceed
  hideError();
  analyzeBtn.disabled = true;
  loading.classList.add('show');
  results.classList.remove('show');

  // Animate steps
  const steps = ['step1', 'step2', 'step3', 'step4'];
  let si = 0;
  steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
  const stepTimer = setInterval(() => {
    steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
    if (si < steps.length) {
      document.getElementById(steps[si])?.classList.add('active');
      si++;
    }
  }, 1200);

  try {
    const jd = jobDesc.value.trim();
    const analysisResult = await analyzeWithOpenRouter(resumeText, jd);
    clearInterval(stepTimer);
    steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
    loading.classList.remove('show');
    displayResults(analysisResult);
  } catch (err) {
    clearInterval(stepTimer);
    steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
    loading.classList.remove('show');
    analyzeBtn.disabled = false;
    showError(err.message || 'Analysis failed. Please try again.');
  }
}

// ============================ //
// OpenRouter API Call //
// ============================ //
async function analyzeWithOpenRouter(textContent, jobDescription) {
  const systemPrompt = `You are an expert resume analyzer and career coach. Analyze resumes and return ONLY valid JSON with no markdown, no backticks, no preamble. Return this exact JSON structure: { "ats_score": <number 0-100>, "strength_score": <number 0-100>, "impact_score": <number 0-100>, "ats_description": "<short label like 'Excellent' or 'Needs Work'>", "strength_description": "<short label>", "impact_description": "<short label>", "summary": "<2-3 sentence executive summary of the resume's strengths and key profile>", "ats_breakdown": [ {"label": "Keyword Optimization", "score": <0-100>}, {"label": "Format & Parsing", "score": <0-100>}, {"label": "Section Structure", "score": <0-100>}, {"label": "File Compatibility", "score": <0-100>} ], "skills_found": [<list of skill strings detected in resume>], "skills_missing": [<list of important skills missing, max 6>], "skills_suggested": [<list of trending skills to add, max 4>], "suggestions": [ { "type": "critical|improve|tip", "title": "<short title>", "description": "<actionable advice>" } ] } Be accurate, specific, and actionable. Provide 4-6 suggestions. If job description is provided, tailor ATS score to keyword match.`;

  let userContent;
  if (jobDescription) {
    userContent = `Analyze this resume:\n\n${textContent}\n\nJob Description to match against:\n\n${jobDescription}\n\nReturn JSON only.`;
  } else {
    userContent = `Analyze this resume:\n\n${textContent}\n\nReturn JSON only.`;
  }

  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ textContent, jobDescription })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API request failed (status ' + response.status + ')');
  }

  const data = await response.json();
  const raw = data.result || '';

  // Clean markdown fences
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON object/array from the response
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) return JSON.parse(arrMatch[0]);
    throw new Error('Could not parse AI response. Please try again.');
  }
}

// ============================ //
// Display Results //
// ============================ //
function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function displayResults(data) {
  // Scores
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
  };

  setText('atsScore', (data.ats_score ?? 0) + '%');
  setText('strengthScore', (data.strength_score ?? 0) + '%');
  setText('impactScore', (data.impact_score ?? 0) + '%');
  setText('atsDesc', data.ats_description || 'ATS Compatibility');
  setText('strengthDesc', data.strength_description || 'Resume Quality');
  setText('impactDesc', data.impact_description || 'Quantified Data');

  // Summary
  const summaryEl = document.getElementById('summaryText');
  if (summaryEl) summaryEl.textContent = data.summary || 'Analysis complete.';

  // ATS Breakdown
  const atsEl = document.getElementById('atsBreakdown');
  if (atsEl) {
    atsEl.innerHTML = (data.ats_breakdown || []).map(item => `
<div class="ats-bar-wrap" style="margin-bottom:14px">
  <div class="ats-bar-label">
    <span>${item.label}</span>
    <span style="font-family:'JetBrains Mono',monospace;color:${getScoreColor(item.score)}">${item.score}%</span>
  </div>
  <div class="ats-bar">
    <div class="ats-bar-fill" style="width:${item.score}%;background:${getScoreColor(item.score)}"></div>
  </div>
</div>
`).join('');
  }

  // Skills
  const skillsEl = document.getElementById('skillsFound');
  if (skillsEl) {
    const found     = (data.skills_found     || []).map(s => `<span class="skill-tag found">✓ ${s}</span>`);
    const missing   = (data.skills_missing   || []).map(s => `<span class="skill-tag missing">✗ ${s}</span>`);
    const suggested = (data.skills_suggested || []).map(s => `<span class="skill-tag suggested">+ ${s}</span>`);
    skillsEl.innerHTML = [...found, ...missing, ...suggested].join('') || '<span style="color:var(--muted);font-size:.85rem">No skills detected</span>';
  }

  // Suggestions
  const sugEl = document.getElementById('suggestions');
  if (sugEl) {
    const icons   = { critical: '🔴', improve: '🟡', tip: '🔵' };
    const classes = { critical: 'critical', improve: 'improve', tip: 'tip' };
    sugEl.innerHTML = (data.suggestions || []).map(s => `
<div class="suggestion-item">
  <div class="suggestion-icon ${classes[s.type] || 'tip'}">${icons[s.type] || '💡'}</div>
  <div class="suggestion-content">
    <div class="title">${s.title}</div>
    <div class="desc">${s.description}</div>
  </div>
</div>
`).join('') || '<p style="color:var(--muted)">No suggestions available.</p>';
  }

  results.classList.add('show');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  analyzeBtn.disabled = false;
}
