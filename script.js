// ============================ //
// CONFIG (top pe change karo easily) //
// ============================ //
// Use the local API when available, with the deployed backend as a fallback
// for static hosting (for example, GitHub Pages).
const API_BASE_URLS = [
  "/api/analyze",
  "https://resume-analyser-yjb7.onrender.com/api/analyze"
];
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
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
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
    results.querySelectorAll('.reveal-item').forEach(el => el.classList.remove('revealed'));
    currentFile = null;
    resumeText = '';
    filePreview.classList.remove('show');
    fileInput.value = '';
    jobDesc.value = '';
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
  results.querySelectorAll('.reveal-item').forEach(el => el.classList.remove('revealed'));

  // Animate steps 1→4 once; last step stays active till result arrives
  const steps = ['step1', 'step2', 'step3', 'step4'];
  let si = 0;
  steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
  const stepTimer = setInterval(() => {
    steps.forEach(s => document.getElementById(s)?.classList.remove('active'));
    if (si < steps.length) {
      document.getElementById(steps[si])?.classList.add('active');
      si++;
    } else {
      document.getElementById(steps[steps.length - 1])?.classList.add('active');
    }
  }, 600);

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35_000);
  let response;
  let networkError;
  try {
    for (const endpoint of API_BASE_URLS) {
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ textContent, jobDescription }),
          signal: controller.signal
        });
      } catch (err) {
        networkError = err;
        continue;
      }

      // A missing same-origin route is expected on static hosts; try Render next.
      if (response.status === 404 && endpoint !== API_BASE_URLS[API_BASE_URLS.length - 1]) continue;
      break;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis took too long. Please try again.');
    }
    throw new Error('Could not connect to the analysis service. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response) {
    if (networkError?.name === 'AbortError') throw new Error('Analysis took too long. Please try again.');
    throw new Error('Could not connect to the analysis service. Please try again.');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'API request failed (status ' + response.status + ')');
  }

  const data = await response.json();
  // Support both the current backend's JSON string and a direct JSON result.
  const raw = typeof data.result === 'string'
    ? data.result
    : (data.result ? JSON.stringify(data.result) : '');

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

function normalizeAnalysis(data) {
  const source = data && typeof data === 'object' ? data : {};
  const score = value => Math.max(0, Math.min(100, Number(value) || 0));
  const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const list = value => Array.isArray(value) ? value : [];

  return {
    ats_score: score(source.ats_score),
    strength_score: score(source.strength_score),
    impact_score: score(source.impact_score),
    ats_description: text(source.ats_description, 'ATS Compatibility'),
    strength_description: text(source.strength_description, 'Resume Quality'),
    impact_description: text(source.impact_description, 'Quantified Results'),
    summary: text(source.summary, 'Your resume analysis is ready. Review the recommendations below to improve it.'),
    ats_breakdown: list(source.ats_breakdown)
      .filter(item => item && typeof item === 'object')
      .map(item => ({ label: text(item.label, 'Resume Factor'), score: score(item.score) })),
    skills_found: list(source.skills_found),
    skills_missing: list(source.skills_missing),
    skills_suggested: list(source.skills_suggested),
    suggestions: list(source.suggestions)
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        type: ['critical', 'improve', 'tip'].includes(item.type) ? item.type : 'tip',
        title: text(item.title, 'Resume recommendation'),
        description: text(item.description, 'Review this section and make the content more specific and measurable.')
      }))
  };
}

function setRingScore(ringId, score) {
  const ring = document.getElementById(ringId);
  if (!ring) return;
  const c = 2 * Math.PI * 52;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  requestAnimationFrame(() => {
    ring.style.strokeDasharray = c.toFixed(2);
    ring.style.strokeDashoffset = (c * (1 - clamped / 100)).toFixed(2);
  });
}

function displayResults(data) {
  data = normalizeAnalysis(data);

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

  setRingScore('atsRing', data.ats_score);
  setRingScore('strengthRing', data.strength_score);
  setRingScore('impactRing', data.impact_score);

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
  results.querySelectorAll('.reveal-item').forEach((el, i) => {
    setTimeout(() => el.classList.add('revealed'), 60 * (i + 1));
  });
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  analyzeBtn.disabled = false;
}
// ============================ //
// RESUME BUILDER (33 templates) //
// ============================ //
const TEMPLATES = [
  { id: 'tpl-faang-clean',        name: 'FAANG Clean',        family: 'Big Tech' },
  { id: 'tpl-faang-navy',         name: 'Big Tech Navy',      family: 'Big Tech' },
  { id: 'tpl-faang-simple',       name: 'Google Simple',      family: 'Big Tech' },
  { id: 'tpl-faang-bullet',       name: 'Microsoft Bullet',   family: 'Big Tech' },
  { id: 'tpl-faang-ats',          name: 'ATS Ultra',          family: 'Big Tech' },
  { id: 'tpl-exp-executive',      name: 'Executive Pro',      family: 'Experience' },
  { id: 'tpl-exp-corporate',      name: 'Corporate Pro',      family: 'Experience' },
  { id: 'tpl-exp-technical',      name: 'Technical Lead',     family: 'Experience' },
  { id: 'tpl-exp-lean',           name: 'Lean Expert',        family: 'Experience' },
  { id: 'tpl-fresher-academic',   name: 'Fresher Academic',   family: 'Fresher' },
  { id: 'tpl-fresher-sky',        name: 'Fresher Sky',        family: 'Fresher' },
  { id: 'tpl-fresher-minimal',    name: 'Fresher Minimal',    family: 'Fresher' },
  { id: 'tpl-fresher-play',       name: 'Fresher Play',       family: 'Fresher' },
  { id: 'tpl-classic-ats',        name: 'Classic ATS',        family: 'ATS' },
  { id: 'tpl-modern-ats',         name: 'Modern ATS',         family: 'ATS' },
  { id: 'tpl-minimal',            name: 'Minimal',            family: 'Minimal' },
  { id: 'tpl-professional',       name: 'Professional',       family: 'Professional' },
  { id: 'tpl-student-fresher',    name: 'Student / Fresher',  family: 'Student' },
  { id: 'tpl-student-vibrant',    name: 'Student Vibrant',    family: 'Student' },
  { id: 'tpl-software-developer', name: 'Software Developer', family: 'Developer' },
  { id: 'tpl-executive',          name: 'Executive',          family: 'Executive' },
  { id: 'tpl-creative-ux',        name: 'Creative (UI/UX)',   family: 'Creative' },
  { id: 'tpl-corporate-standard', name: 'Corporate Standard', family: 'Professional' },
  { id: 'tpl-classic-clean',      name: 'Classic Clean',      family: 'Classic' },
  { id: 'tpl-classic-serif',      name: 'Classic Serif',      family: 'Classic' },
  { id: 'tpl-classic-centered',   name: 'Classic Centered',   family: 'Classic' },
  { id: 'tpl-classic-underline',  name: 'Classic Underline',  family: 'Classic' },
  { id: 'tpl-classic-slate',      name: 'Classic Slate',      family: 'Classic' },
  { id: 'tpl-classic-traditional',name: 'Classic Traditional',family: 'Classic' },
  { id: 'tpl-classic-compact',    name: 'Classic Compact',    family: 'Classic' },
  { id: 'tpl-modern-banner',      name: 'Modern Banner',      family: 'Modern' },
  { id: 'tpl-modern-sidebar',     name: 'Modern Sidebar',     family: 'Modern', layout: 'sidebar' },
  { id: 'tpl-modern-rightbar',    name: 'Modern Right Bar',   family: 'Modern', layout: 'sidebar' },
  { id: 'tpl-modern-split',       name: 'Modern Split',       family: 'Modern', layout: 'sidebar' },
  { id: 'tpl-modern-gradient',    name: 'Modern Gradient',    family: 'Modern' },
  { id: 'tpl-modern-teal',        name: 'Modern Teal',        family: 'Modern' },
  { id: 'tpl-modern-navy',        name: 'Modern Navy',        family: 'Modern' },
  { id: 'tpl-modern-mint',        name: 'Modern Mint',        family: 'Modern' },
  { id: 'tpl-ats-mono',           name: 'ATS Mono',           family: 'ATS' },
  { id: 'tpl-ats-sparse',         name: 'ATS Sparse',         family: 'ATS' },
  { id: 'tpl-ats-tags',           name: 'ATS Tags',           family: 'ATS' },
  { id: 'tpl-ats-lines',          name: 'ATS Lines',          family: 'ATS' },
  { id: 'tpl-ats-numbered',       name: 'ATS Numbered',       family: 'ATS' },
  { id: 'tpl-creative-caps',      name: 'Creative Caps',      family: 'Creative' },
  { id: 'tpl-creative-diamond',   name: 'Creative Diamond',   family: 'Creative' },
  { id: 'tpl-creative-block',     name: 'Creative Block',     family: 'Creative' },
  { id: 'tpl-creative-art',       name: 'Creative Art',       family: 'Creative' }
];

const BUILDER_STATE = { active: 'tpl-classic-clean', skills: [] };

const SAMPLE = {
  personal: {
    name: 'Aman Kumar',
    title: 'Full-Stack Web Developer',
    email: 'your@email.com',
    phone: '+91 98765 43210',
    location: 'City, Country',
    linkedin: 'linkedin.com/in/your-profile',
    github: 'github.com/your-username',
    website: 'yourwebsite.com',
    summary: 'Passionate full-stack developer with 2+ years of experience building responsive web applications. Skilled in JavaScript, React, Node.js and cloud deployment, with a strong focus on clean code, performance and measurable business impact.',
    summaryStudent: 'Motivated and detail-oriented student with a solid foundation in web development (HTML, CSS, JavaScript, React, Node.js, Python) and a strong passion for building clean, user-friendly applications. A quick learner with excellent problem-solving and teamwork skills, demonstrated through hands-on projects and hackathons. Seeking an entry-level role or internship to apply and grow my skills in a professional environment.'
  },
  experience: [
    {
      role: 'Frontend Developer', company: 'Tech Solutions Pvt Ltd',
      start: 'Jun 2023', end: 'Present', location: 'New Delhi',
      bullets: [
        'Developed 15+ responsive web applications using React, improving page load times by 40%.',
        'Collaborated with designers to ship pixel-perfect UI components translated from Figma.',
        'Reduced bug rate by 30% by introducing unit tests with Jest and Cypress.'
      ]
    },
    {
      role: 'Web Developer Intern', company: 'StartupHub',
      start: 'Jan 2022', end: 'May 2023', location: 'Remote',
      bullets: [
        'Built REST APIs with Node.js and Express serving 10k+ monthly users.',
        'Automated deployment pipelines with GitHub Actions, cutting release time by 50%.'
      ]
    }
  ],
  projects: [
    {
      name: 'ResumeInsight AI',
      link: 'github.com/your-username/resume-analyzer',
      desc: 'AI-powered resume analyzer that scores ATS compatibility and suggests improvements using the OpenRouter API.',
      tech: 'HTML, CSS, JavaScript, Node.js, Express, AI APIs'
    },
    {
      name: 'E-Commerce Store',
      link: 'github.com/your-username/ecommerce',
      desc: 'Full-featured store with cart, payments and admin dashboard handling 1k+ products.',
      tech: 'React, Node.js, MongoDB, Stripe'
    }
  ],
  education: [
    { degree: 'B.Tech in Computer Science', school: 'ABC Institute of Technology', start: '2020', end: '2024', score: 'CGPA 8.5/10' }
  ],
  skills: ['JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'HTML', 'CSS', 'Git', 'GitHub', 'REST APIs', 'Python', 'Figma'],
  certifications: [
    { name: 'Full-Stack Web Development', issuer: 'Coursera / Meta', year: '2023' },
    { name: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', year: '2024' }
  ],
  internship: [
    {
      role: 'Software Developer Intern', company: 'Company Name',
      start: 'Jan 2026', end: 'Mar 2026',
      bullets: [
        'Assisted in developing responsive web applications.',
        'Collaborated with the development team to fix bugs and implement new features.',
        'Participated in code reviews and testing.'
      ]
    }
  ],
  achievements: [
    'Completed multiple real-world development projects.',
    'Solved coding problems on online platforms.',
    'Participated in hackathons and coding competitions.'
  ],
  por: ['Technical Club Member', 'Event Coordinator', 'Class Representative'],
  languages: ['English', 'Hindi'],
  interests: ['Full-Stack Development', 'Flutter App Development', 'Artificial Intelligence', 'Cloud Computing', 'Open Source']
};

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function getTpl(id) { return TEMPLATES.find(t => t.id === id) || TEMPLATES[0]; }

// ---------- Section renderers (return HTML) ----------
function renderHeader(p) {
  const c = [];
  if (p.email)    c.push('<span>✉ ' + esc(p.email) + '</span>');
  if (p.phone)    c.push('<span>☎ ' + esc(p.phone) + '</span>');
  if (p.location) c.push('<span>📍 ' + esc(p.location) + '</span>');
  if (p.linkedin) c.push('<span>in / ' + esc(p.linkedin) + '</span>');
  if (p.github)   c.push('<span>gh / ' + esc(p.github) + '</span>');
  if (p.website)  c.push('<span>' + esc(p.website) + '</span>');
  const contact = c.length ? '<div class="rs-contact">' + c.join('') + '</div>' : '';
  return '<div class="rs-header">' +
    '<h1 class="rs-name">' + esc(p.name || 'Your Name') + '</h1>' +
    (p.title ? '<div class="rs-title">' + esc(p.title) + '</div>' : '') +
    contact + '</div>';
}

function renderSummary(p) {
  return p.summary ? '<div class="rs-summary">' + esc(p.summary) + '</div>' : '';
}

function renderExperience(list) {
  if (!list.length) return '';
  const items = list.map(e => {
    const date = (e.start || e.end) ? '<span class="rs-item-date">' + esc(e.start || '') + (e.start && e.end ? ' – ' : '') + esc(e.end || '') + '</span>' : '';
    const sub = (e.company || e.location) ? '<div class="rs-item-sub">' + esc(e.company || '') + (e.company && e.location ? '<span class="rs-sep">·</span>' : '') + esc(e.location || '') + '</div>' : '';
    const bullets = (e.bullets && e.bullets.length) ? '<ul class="rs-bullets">' + e.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '';
    return '<div class="rs-item"><div class="rs-item-head"><span class="rs-item-role">' + esc(e.role || 'Role') + '</span>' + date + '</div>' + sub + bullets + '</div>';
  }).join('');
  return '<div class="rs-section rs-experience"><h2 class="rs-section-title">Work Experience</h2>' + items + '</div>';
}

function renderInternship(list) {
  if (!list.length) return '';
  const items = list.map(e => {
    const date = (e.start || e.end) ? '<span class="rs-item-date">' + esc(e.start || '') + (e.start && e.end ? ' – ' : '') + esc(e.end || '') + '</span>' : '';
    const sub = e.company ? '<div class="rs-item-sub">' + esc(e.company) + '</div>' : '';
    const bullets = (e.bullets && e.bullets.length) ? '<ul class="rs-bullets">' + e.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '';
    return '<div class="rs-item"><div class="rs-item-head"><span class="rs-item-role">' + esc(e.role || 'Role') + '</span>' + date + '</div>' + sub + bullets + '</div>';
  }).join('');
  return '<div class="rs-section rs-internship"><h2 class="rs-section-title">Internship / Experience</h2>' + items + '</div>';
}

function renderListSection(title, list) {
  if (!list.length) return '';
  const items = list.map(a => '<li>' + esc(a) + '</li>').join('');
  return '<div class="rs-section"><h2 class="rs-section-title">' + esc(title) + '</h2><ul class="rs-bullets">' + items + '</ul></div>';
}

function renderInlineSection(title, list) {
  if (!list.length) return '';
  return '<div class="rs-section"><h2 class="rs-section-title">' + esc(title) + '</h2>' +
    '<div class="rs-item-sub">' + list.map(esc).join('<span class="rs-sep">·</span>') + '</div></div>';
}

function renderProjects(list) {
  if (!list.length) return '';
  const items = list.map(p => {
    const subParts = [];
    if (p.link) subParts.push('<a class="rs-proj-link" href="' + esc(p.link) + '" target="_blank" rel="noopener">' + esc(p.link) + '</a>');
    if (p.tech) subParts.push(esc(p.tech));
    const sub = subParts.length ? '<div class="rs-item-sub">' + subParts.join('<span class="rs-sep">·</span>') + '</div>' : '';
    const desc = p.desc ? '<div class="rs-summary" style="margin-top:2px">' + esc(p.desc) + '</div>' : '';
    return '<div class="rs-item"><div class="rs-item-head"><span class="rs-item-role">' + esc(p.name || 'Project') + '</span></div>' + sub + desc + '</div>';
  }).join('');
  return '<div class="rs-section rs-projects"><h2 class="rs-section-title">Projects</h2>' + items + '</div>';
}

function renderEducation(list) {
  if (!list.length) return '';
  const items = list.map(e => {
    const years = (e.start || e.end) ? esc(e.start || '') + (e.start && e.end ? ' – ' : '') + esc(e.end || '') : '';
    const date = years ? '<span class="rs-item-date">' + years + '</span>' : '';
    const detail = [];
    if (e.score) detail.push(esc(e.score));
    return '<div class="rs-item"><div class="rs-item-head"><span class="rs-item-role">' + esc(e.degree || 'Degree') + '</span>' + date + '</div>' +
      '<div class="rs-item-sub">' + esc(e.school || '') + (e.score ? '<span class="rs-sep">·</span>' + detail.join('') : '') + '</div></div>';
  }).join('');
  return '<div class="rs-section rs-education"><h2 class="rs-section-title">Education</h2>' + items + '</div>';
}

function renderSkills(list) {
  if (!list.length) return '';
  const tags = list.map(s => '<span class="rs-tag">' + esc(s) + '</span>').join('');
  return '<div class="rs-section rs-skills"><h2 class="rs-section-title">Skills</h2><div class="rs-tags">' + tags + '</div></div>';
}

function renderCerts(list) {
  if (!list.length) return '';
  const items = list.map(c => {
    const year = c.year ? '<span class="rs-item-date">' + esc(c.year) + '</span>' : '';
    return '<div class="rs-item"><div class="rs-item-head"><span class="rs-item-role">' + esc(c.name || 'Certification') + '</span>' + year + '</div>' +
      (c.issuer ? '<div class="rs-item-sub">' + esc(c.issuer) + '</div>' : '') + '</div>';
  }).join('');
  return '<div class="rs-section rs-certifications"><h2 class="rs-section-title">Certifications</h2>' + items + '</div>';
}

function sheetHtml(state, tpl) {
  const header = renderHeader(state.personal);
  const summary = renderSummary(state.personal);
  const exp = renderExperience(state.experience);
  const proj = renderProjects(state.projects);
  const edu = renderEducation(state.education);
  const skills = renderSkills(state.skills);
  const certs = renderCerts(state.certifications);
  const intern = renderInternship(state.internship);
  const ach = renderListSection('Achievements', state.achievements);
  const por = renderListSection('Positions of Responsibility', state.por);
  const langs = renderInlineSection('Languages', state.languages);
  const ints = renderInlineSection('Interests', state.interests);

  let body;
  if (tpl.layout === 'sidebar') {
    body = '<div class="rs-body"><div class="rs-main">' + summary + exp + proj + edu + '</div><div class="rs-side">' + skills + certs + '</div></div>';
  } else if (tpl.family === 'Student' || tpl.family === 'Fresher') {
    // Fresher-focused order: education pe focus, internship toggle-able
    body = summary + edu + skills + proj + intern + certs + ach + por + langs + ints;
  } else if (tpl.family === 'Experience' || tpl.family === 'Big Tech') {
    // Experienced / Big-tech order: experience first, full sections
    body = summary + exp + intern + proj + edu + skills + certs + ach + por + langs + ints;
  } else {
    body = summary + exp + proj + edu + skills + certs;
  }
  return header + body;
}

function getMergedState() {
  const s = collectState();
  const includeExp = document.getElementById('includeExperience')?.checked !== false;
  const includeIntern = document.getElementById('includeInternship')?.checked !== false;
  const toggleOn = id => document.getElementById(id)?.checked !== false;

  // WYSIWYG: download/preview hamesha form me jo likha hai wahi dikhata hai.
  // (Pehle khali fields sample data se bhari jaati thin — delete/clear karne par
  //  purana content wapas aa jata tha, isliye ab exactly user data use hota hai.)
  return {
    personal: {
      name: s.personal.name,
      title: s.personal.title,
      email: s.personal.email,
      phone: s.personal.phone,
      location: s.personal.location,
      linkedin: toggleOn('useLinkedin') ? s.personal.linkedin : '',
      github: toggleOn('useGithub') ? s.personal.github : '',
      website: toggleOn('useWebsite') ? s.personal.website : '',
      summary: s.personal.summary
    },
    experience: !includeExp ? [] : s.experience,
    internship: !includeIntern ? [] : s.internship,
    projects: s.projects,
    education: s.education,
    certifications: s.certifications,
    skills: s.skills,
    achievements: s.achievements,
    por: s.por,
    languages: s.languages,
    interests: s.interests
  };
}

function renderPreview() {
  const sheet = document.getElementById('resumeSheet');
  const tpl = getTpl(BUILDER_STATE.active);
  const merged = getMergedState();

  const preview = sheet.closest('.builder-preview');
  const emptyEl = document.getElementById('previewEmpty');
  if (emptyEl) emptyEl.remove();

  sheet.style.display = '';
  sheet.className = 'resume-sheet ' + tpl.id;
  sheet.innerHTML = sheetHtml(merged, tpl);
  fitResumePreview();
}

// Fit the 560px resume sheet into the preview width on small screens (phone/tablet).
function fitResumePreview() {
  const sheet = document.getElementById('resumeSheet');
  const preview = sheet && sheet.closest('.builder-preview');
  if (!sheet || !preview) return;
  if (preview.clientWidth === 0) return;
  const cs = window.getComputedStyle(preview);
  const avail = preview.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const scale = Math.min(1, avail / 560);
  sheet.style.zoom = scale;
}

window.addEventListener('resize', () => {
  clearTimeout(fitResumePreview._t);
  fitResumePreview._t = setTimeout(fitResumePreview, 150);
});

// ---------- State collection from form DOM ----------
function splitLines(text) {
  return String(text || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}

function collectState() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const includeExperience = document.getElementById('includeExperience')?.checked !== false;
  const includeInternship = document.getElementById('includeInternship')?.checked !== false;
  const list = (wrapId, map) => Array.from(document.querySelectorAll('#' + wrapId + ' .b-item')).map(item => {
    const o = {};
    for (const key in map) o[key] = (item.querySelector(map[key])?.value || '').trim();
    return o;
  });

  const experience = list('expList', { role: '.f-role', company: '.f-company', start: '.f-start', end: '.f-end', location: '.f-loc', bullets: '.f-bullets' });
  experience.forEach(e => { e.bullets = e.bullets.split('\n').map(s => s.trim()).filter(Boolean); });

  const internship = list('internList', { role: '.f-irole', company: '.f-icompany', start: '.f-istart', end: '.f-iend', bullets: '.f-ibullets' });
  internship.forEach(e => { e.bullets = e.bullets.split('\n').map(s => s.trim()).filter(Boolean); });

  return {
    personal: {
      name: v('bfName'), title: v('bfTitle'), email: v('bfEmail'), phone: v('bfPhone'),
      location: v('bfLocation'), linkedin: v('bfLinkedin'), github: v('bfGithub'),
      website: v('bfWebsite'), summary: v('bfSummary')
    },
    experience: includeExperience ? experience : [],
    internship: includeInternship ? internship : [],
    projects: list('projList', { name: '.f-pname', link: '.f-plink', desc: '.f-pdesc', tech: '.f-ptech' }),
    education: list('eduList', { degree: '.f-degree', school: '.f-school', start: '.f-edstart', end: '.f-edend', score: '.f-score' }),
    certifications: list('certList', { name: '.f-cname', issuer: '.f-cissuer', year: '.f-cyear' }),
    skills: BUILDER_STATE.skills.slice(),
    achievements: splitLines(v('bfAchievements')),
    por: splitLines(v('bfPor')),
    languages: splitLines(v('bfLanguages')),
    interests: splitLines(v('bfInterests'))
  };
}

// ---------- Dynamic list item templates ----------
const expItemHtml = () => '<div class="b-item"><div class="b-item-head"><span>Experience</span><button type="button" class="b-del" aria-label="Remove">✕</button></div>' +
  '<div class="b-grid b-2"><label>Role<input class="f-role" placeholder="Your Job Role"></label><label>Company<input class="f-company" placeholder="Company Name"></label></div>' +
  '<div class="b-grid b-2"><label>Start<input class="f-start" placeholder="Jun 2023"></label><label>End<input class="f-end" placeholder="Present"></label></div>' +
  '<label>Location<input class="f-loc" placeholder="City, Country"></label>' +
  '<label>Achievements (one per line)<textarea class="f-bullets" rows="3" placeholder="Achievement 1&#10;Achievement 2&#10;Achievement 3"></textarea></label></div>';

const internItemHtml = () => '<div class="b-item"><div class="b-item-head"><span>Internship</span><button type="button" class="b-del" aria-label="Remove">✕</button></div>' +
  '<div class="b-grid b-2"><label>Role<input class="f-irole" placeholder="Software Developer Intern"></label><label>Company<input class="f-icompany" placeholder="Company Name"></label></div>' +
  '<div class="b-grid b-2"><label>Start<input class="f-istart" placeholder="Jan 2026"></label><label>End<input class="f-iend" placeholder="Mar 2026"></label></div>' +
  '<label>What you did (one per line)<textarea class="f-ibullets" rows="3" placeholder="Assisted in building web apps&#10;Fixed bugs and implemented new features"></textarea></label></div>';

const projItemHtml = () => '<div class="b-item"><div class="b-item-head"><span>Project</span><button type="button" class="b-del" aria-label="Remove">✕</button></div>' +
  '<div class="b-grid b-2"><label>Project Name<input class="f-pname" placeholder="Project Name"></label><label>Link<input class="f-plink" placeholder="github.com/your-repo"></label></div>' +
  '<label>Description<textarea class="f-pdesc" rows="2" placeholder="Short description..."></textarea></label>' +
  '<label>Tech Stack<input class="f-ptech" placeholder="React, Node.js, MongoDB"></label></div>';

const eduItemHtml = () => '<div class="b-item"><div class="b-item-head"><span>Education</span><button type="button" class="b-del" aria-label="Remove">✕</button></div>' +
  '<div class="b-grid b-2"><label>Degree<input class="f-degree" placeholder="Your Degree"></label><label>School<input class="f-school" placeholder="Institute Name"></label></div>' +
  '<div class="b-grid b-2"><label>Start Year<input class="f-edstart" placeholder="2020"></label><label>End Year<input class="f-edend" placeholder="2024"></label></div>' +
  '<label>Score / CGPA<input class="f-score" placeholder="CGPA 8.5/10"></label></div>';

const certItemHtml = () => '<div class="b-item"><div class="b-item-head"><span>Certification</span><button type="button" class="b-del" aria-label="Remove">✕</button></div>' +
  '<div class="b-grid b-2"><label>Cert Name<input class="f-cname" placeholder="Certification Name"></label><label>Issuer<input class="f-cissuer" placeholder="Issuing Organization"></label></div>' +
  '<label>Year<input class="f-cyear" placeholder="2024"></label></div>';

function addItem(listId, htmlFn) {
  const list = document.getElementById(listId);
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlFn();
  list.appendChild(tmp.firstChild);
}

document.getElementById('addExp').addEventListener('click', () => addItem('expList', expItemHtml));
document.getElementById('addProj').addEventListener('click', () => addItem('projList', projItemHtml));
document.getElementById('addEdu').addEventListener('click', () => addItem('eduList', eduItemHtml));
document.getElementById('addCert').addEventListener('click', () => addItem('certList', certItemHtml));
document.getElementById('addIntern').addEventListener('click', () => addItem('internList', internItemHtml));

['expList', 'projList', 'eduList', 'certList', 'internList'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.classList.contains('b-del')) e.target.closest('.b-item')?.remove();
  });
});

// ---------- Skills tags ----------
function renderSkillTags() {
  document.getElementById('skillTags').innerHTML = BUILDER_STATE.skills.map((s, i) =>
    '<span class="b-tag">' + esc(s) + '<button type="button" data-i="' + i + '" aria-label="Remove">✕</button></span>').join('');
}

document.getElementById('skillInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = document.getElementById('skillInput').value.trim().replace(/,$/, '');
    if (val && !BUILDER_STATE.skills.some(s => s.toLowerCase() === val.toLowerCase())) {
      BUILDER_STATE.skills.push(val);
      document.getElementById('skillInput').value = '';
      renderSkillTags();
      renderPreview();
    }
  }
});

document.getElementById('skillTags').addEventListener('click', e => {
  const btn = e.target.closest('button[data-i]');
  if (btn) {
    BUILDER_STATE.skills.splice(Number(btn.dataset.i), 1);
    renderSkillTags();
    renderPreview();
  }
});

// ---------- Template picker (real scaled thumbnails, grouped by category) ----------
let thumbsBuilt = false;
function buildTemplateThumbs() {
  if (thumbsBuilt) return;
  thumbsBuilt = true;
  const grid = document.getElementById('templateGrid');
  const scale = 100 / 560;

  // Group templates by family, keeping the order of first appearance
  const groups = [];
  TEMPLATES.forEach(t => {
    const existing = groups.find(g => g.family === t.family);
    if (existing) existing.items.push(t);
    else groups.push({ family: t.family, items: [t] });
  });

  groups.forEach(group => {
    const heading = document.createElement('div');
    heading.className = 'tpl-group';
    heading.innerHTML = '<span class="tpl-group-icon">▸</span>' +
      '<span class="tpl-group-name">' + group.family + ' Templates</span>' +
      '<span class="tpl-group-count">' + group.items.length + '</span>';

    const row = document.createElement('div');
    row.className = 'tpl-row';

    group.items.forEach(t => {
      const card = document.createElement('div');
      card.className = 'tpl-card' + (t.id === BUILDER_STATE.active ? ' selected' : '');
      card.dataset.id = t.id;

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const sheet = document.createElement('div');
      sheet.className = 'resume-sheet ' + t.id;
      const thumbSample = (t.family === 'Student' || t.family === 'Fresher')
        ? { ...SAMPLE, personal: { ...SAMPLE.personal, summary: SAMPLE.personal.summaryStudent } }
        : SAMPLE;
      sheet.innerHTML = sheetHtml(thumbSample, t);
      thumb.appendChild(sheet);

      const label = document.createElement('div');
      label.className = 'tpl-label';
      label.textContent = t.name;

      card.appendChild(thumb);
      card.appendChild(label);
      card.addEventListener('click', () => setTemplate(t.id));
      row.appendChild(card);
    });

    grid.appendChild(heading);
    grid.appendChild(row);
  });

  grid.querySelectorAll('.thumb').forEach(th => { th.style.transform = 'scale(' + scale + ')'; });
}

function setTemplate(id) {
  BUILDER_STATE.active = id;
  document.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
  const t = getTpl(id);
  const label = document.getElementById('selectedTplName');
  if (label) label.textContent = t ? t.name : '';
  syncSummarySample();
  renderPreview();
  const preview = document.querySelector('.builder-preview');
  if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Summary field me sample tab tak update karo jab tak user ne apna summary nahi likha
function syncSummarySample() {
  const el = document.getElementById('bfSummary');
  if (!el) return;
  const cur = (el.value || '').trim();
  const known = [SAMPLE.personal.summary, SAMPLE.personal.summaryStudent];
  if (!cur || known.includes(cur)) {
    const fam = getTpl(BUILDER_STATE.active).family;
    el.value = (fam === 'Student' || fam === 'Fresher')
      ? SAMPLE.personal.summaryStudent
      : SAMPLE.personal.summary;
  }
}

// ---------- Sample / Clear ----------
function fillList(listId, htmlFn, items, setter) {
  document.getElementById(listId).innerHTML = '';
  items.forEach(it => {
    const tmp = document.createElement('div');
    tmp.innerHTML = htmlFn();
    const node = tmp.firstChild;
    document.getElementById(listId).appendChild(node);
    setter(node, it);
  });
}

function fillSample() {
  const p = SAMPLE.personal;
  const setV = (id, val) => { document.getElementById(id).value = val; };
  setV('bfName', p.name); setV('bfTitle', p.title); setV('bfEmail', p.email); setV('bfPhone', p.phone);
  setV('bfLocation', p.location); setV('bfLinkedin', p.linkedin); setV('bfGithub', p.github);
  setV('bfWebsite', p.website);
  syncSummarySample();

  fillList('expList', expItemHtml, SAMPLE.experience, (node, it) => {
    node.querySelector('.f-role').value = it.role;
    node.querySelector('.f-company').value = it.company;
    node.querySelector('.f-start').value = it.start;
    node.querySelector('.f-end').value = it.end;
    node.querySelector('.f-loc').value = it.location;
    node.querySelector('.f-bullets').value = it.bullets.join('\n');
  });
  fillList('projList', projItemHtml, SAMPLE.projects, (node, it) => {
    node.querySelector('.f-pname').value = it.name;
    node.querySelector('.f-plink').value = it.link;
    node.querySelector('.f-pdesc').value = it.desc;
    node.querySelector('.f-ptech').value = it.tech;
  });
  fillList('eduList', eduItemHtml, SAMPLE.education, (node, it) => {
    node.querySelector('.f-degree').value = it.degree;
    node.querySelector('.f-school').value = it.school;
    node.querySelector('.f-edstart').value = it.start;
    node.querySelector('.f-edend').value = it.end;
    node.querySelector('.f-score').value = it.score;
  });
  fillList('certList', certItemHtml, SAMPLE.certifications, (node, it) => {
    node.querySelector('.f-cname').value = it.name;
    node.querySelector('.f-cissuer').value = it.issuer;
    node.querySelector('.f-cyear').value = it.year;
  });
  fillList('internList', internItemHtml, SAMPLE.internship, (node, it) => {
    node.querySelector('.f-irole').value = it.role;
    node.querySelector('.f-icompany').value = it.company;
    node.querySelector('.f-istart').value = it.start;
    node.querySelector('.f-iend').value = it.end;
    node.querySelector('.f-ibullets').value = it.bullets.join('\n');
  });
  setV('bfAchievements', SAMPLE.achievements.join('\n'));
  setV('bfPor', SAMPLE.por.join('\n'));
  setV('bfLanguages', SAMPLE.languages.join('\n'));
  setV('bfInterests', SAMPLE.interests.join('\n'));

  BUILDER_STATE.skills = SAMPLE.skills.slice();
  renderSkillTags();
  renderPreview();
}

// Load sample in every section EXCEPT Personal Info (kept blank for the user)
function fillNonPersonal() {
  syncSummarySample();

  fillList('expList', expItemHtml, SAMPLE.experience, (node, it) => {
    node.querySelector('.f-role').value = it.role;
    node.querySelector('.f-company').value = it.company;
    node.querySelector('.f-start').value = it.start;
    node.querySelector('.f-end').value = it.end;
    node.querySelector('.f-loc').value = it.location;
    node.querySelector('.f-bullets').value = it.bullets.join('\n');
  });
  fillList('projList', projItemHtml, SAMPLE.projects, (node, it) => {
    node.querySelector('.f-pname').value = it.name;
    node.querySelector('.f-plink').value = it.link;
    node.querySelector('.f-pdesc').value = it.desc;
    node.querySelector('.f-ptech').value = it.tech;
  });
  fillList('eduList', eduItemHtml, SAMPLE.education, (node, it) => {
    node.querySelector('.f-degree').value = it.degree;
    node.querySelector('.f-school').value = it.school;
    node.querySelector('.f-edstart').value = it.start;
    node.querySelector('.f-edend').value = it.end;
    node.querySelector('.f-score').value = it.score;
  });
  fillList('certList', certItemHtml, SAMPLE.certifications, (node, it) => {
    node.querySelector('.f-cname').value = it.name;
    node.querySelector('.f-cissuer').value = it.issuer;
    node.querySelector('.f-cyear').value = it.year;
  });
  fillList('internList', internItemHtml, SAMPLE.internship, (node, it) => {
    node.querySelector('.f-irole').value = it.role;
    node.querySelector('.f-icompany').value = it.company;
    node.querySelector('.f-istart').value = it.start;
    node.querySelector('.f-iend').value = it.end;
    node.querySelector('.f-ibullets').value = it.bullets.join('\n');
  });
  document.getElementById('bfAchievements').value = SAMPLE.achievements.join('\n');
  document.getElementById('bfPor').value = SAMPLE.por.join('\n');
  document.getElementById('bfLanguages').value = SAMPLE.languages.join('\n');
  document.getElementById('bfInterests').value = SAMPLE.interests.join('\n');

  BUILDER_STATE.skills = SAMPLE.skills.slice();
  renderSkillTags();
  renderPreview();
}

document.getElementById('loadSample').addEventListener('click', fillSample);

document.getElementById('clearBuilder').addEventListener('click', () => {
  ['bfName', 'bfTitle', 'bfEmail', 'bfPhone', 'bfLocation', 'bfLinkedin', 'bfGithub', 'bfWebsite', 'bfSummary', 'bfAchievements', 'bfPor', 'bfLanguages', 'bfInterests']
    .forEach(id => { document.getElementById(id).value = ''; });
  ['expList', 'projList', 'eduList', 'certList', 'internList'].forEach(id => { document.getElementById(id).innerHTML = ''; });
  BUILDER_STATE.skills = [];
  renderSkillTags();
  renderPreview();
  const preview = document.querySelector('.builder-preview');
  if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- Live binding ----------
document.querySelector('.builder-form').addEventListener('input', renderPreview);
document.getElementById('includeExperience').addEventListener('change', e => {
  document.getElementById('experienceCard').classList.toggle('section-disabled', !e.target.checked);
  renderPreview();
});
document.getElementById('includeInternship').addEventListener('change', e => {
  document.getElementById('internshipCard').classList.toggle('section-disabled', !e.target.checked);
  renderPreview();
});
[['useLinkedin', 'bfLinkedin'], ['useGithub', 'bfGithub'], ['useWebsite', 'bfWebsite']].forEach(([togId, inpId]) => {
  const tog = document.getElementById(togId);
  const inp = document.getElementById(inpId);
  const apply = () => {
    const off = !tog.checked;
    inp.disabled = off;
    inp.closest('.b-field').classList.toggle('field-off', off);
    renderPreview();
  };
  tog.addEventListener('change', apply);
  apply();
});

// ---------- Tabs ----------
function switchTab(tab) {
  document.getElementById('analyzerSection').classList.toggle('hidden', tab !== 'analyzer');
  document.getElementById('builderSection').classList.toggle('hidden', tab !== 'builder');
  document.getElementById('tabAnalyzer').classList.toggle('active', tab === 'analyzer');
  document.getElementById('tabBuilder').classList.toggle('active', tab === 'builder');
  if (tab === 'builder') {
    buildTemplateThumbs();
    renderPreview();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('tabAnalyzer').addEventListener('click', () => switchTab('analyzer'));
document.getElementById('tabBuilder').addEventListener('click', () => switchTab('builder'));

// ---------- Download (PDF / Word / TXT) ----------
const downloadMenu = document.getElementById('downloadMenu');
const downloadBtn = document.getElementById('downloadBtn');
const downloadDropdown = document.getElementById('downloadDropdown');

downloadBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = downloadDropdown.classList.toggle('open');
  downloadBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', () => {
  downloadDropdown.classList.remove('open');
  downloadBtn.setAttribute('aria-expanded', 'false');
});

downloadDropdown.querySelectorAll('.b-dropdown-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    downloadDropdown.classList.remove('open');
    downloadBtn.setAttribute('aria-expanded', 'false');
    const format = item.dataset.format;
    if (format === 'pdf') downloadPdf();
    else if (format === 'word') downloadWord();
  });
});

function getFileName() {
  const state = getMergedState();
  return (state.personal.name || 'resume').replace(/[^\w-]+/g, '-').toLowerCase();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function cssToRgb(value) {
  if (!value) return null;
  const str = String(value).trim();
  const hex = str.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map(p => parseFloat(p));
    if (parts.length >= 3 && !isNaN(parts[0]) && parts[3] !== 0) return [parts[0], parts[1], parts[2]];
  }
  const g = str.match(/linear-gradient\(([^)]+)\)/i);
  if (g) {
    const first = g[1].match(/rgba?\(([^)]+)\)/i);
    if (first) {
      const parts = first[1].split(',').map(p => parseFloat(p));
      if (parts.length >= 3 && !isNaN(parts[0]) && parts[3] !== 0) return [parts[0], parts[1], parts[2]];
    }
  }
  return null;
}

function sheetColor(sel, prop, fb) {
  const el = document.querySelector('#resumeSheet ' + sel);
  if (!el) return fb;
  return cssToRgb(getComputedStyle(el)[prop]) || fb;
}

function sheetColors() {
  return {
    header: sheetColor('.rs-header', 'backgroundColor', [37, 99, 235]),
    name: sheetColor('.rs-name', 'color', [15, 23, 42]),
    title: sheetColor('.rs-title', 'color', [71, 85, 105]),
    accent: sheetColor('.rs-section-title', 'color', [37, 99, 235]),
    underline: sheetColor('.rs-section-title', 'borderBottomColor', null) || sheetColor('.rs-section-title', 'color', [37, 99, 235]),
    muted: sheetColor('.rs-item-date', 'color', [51, 65, 85]),
    body: sheetColor('.rs-summary', 'color', null) || sheetColor('.rs-section', 'color', [15, 23, 42])
  };
}

async function downloadPdf() {
  const btn = downloadBtn;
  if (typeof window.jspdf === 'undefined') {
    alert('PDF library load nahi hui. Page refresh karke dobara try karo.');
    return;
  }
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Generating PDF...';
  try {
    const s = getMergedState();
    const { jsPDF } = window.jspdf;
    const C = sheetColors();

    const pageW = 210;
    const pageH = 297;
    const marginL = 14;
    const marginR = 14;
    const maxW = pageW - marginL - marginR;
    const pageBottom = pageH - 10;

    const drawContent = (doc, sc, allowBreaks) => {
      const S = v => v * sc;
      let y = 14;

      doc.setFillColor(...C.header);
      doc.rect(0, 0, pageW, 6, 'F');

      // Header: name + title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(S(20));
      doc.setTextColor(...C.name);
      doc.text(s.personal.name || 'Your Name', marginL, y + S(6));
      y += S(11);

      if (s.personal.title) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(S(11.5));
        doc.setTextColor(...C.title);
        doc.text(s.personal.title, marginL, y);
        y += S(5.5);
      }

      // Contact line
      const contact = [];
      if (s.personal.email) contact.push(s.personal.email);
      if (s.personal.phone) contact.push(s.personal.phone);
      if (s.personal.location) contact.push(s.personal.location);
      if (s.personal.linkedin) contact.push('in/' + s.personal.linkedin);
      if (s.personal.github) contact.push('gh/' + s.personal.github);
      if (s.personal.website) contact.push(s.personal.website);
      if (contact.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(S(9));
        doc.setTextColor(...C.muted);
        const contactLines = doc.splitTextToSize(contact.join('  |  '), maxW);
        doc.text(contactLines, marginL, y);
        y += contactLines.length * S(3.6) + S(2);
      }

      const sectionTitle = txt => {
        if (y > pageH - S(14) && allowBreaks) { doc.addPage(); y = 14; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(S(11));
        doc.setTextColor(...C.accent);
        doc.text(txt.toUpperCase(), marginL, y);
        y += S(1.5);
        doc.setDrawColor(...C.underline);
        doc.setLineWidth(0.5);
        doc.line(marginL, y, marginL + maxW, y);
        y += S(5);
      };

      const bodyText = (txt, size) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(S(size));
        doc.setTextColor(...C.body);
        const lines = doc.splitTextToSize(txt, maxW);
        lines.forEach(l => {
          if (y > pageBottom && allowBreaks) { doc.addPage(); y = 14; }
          doc.text(l, marginL, y);
          y += size * sc * 0.42 + S(0.8);
        });
      };

      const twoCol = (left, right) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(S(10.5));
        doc.setTextColor(...C.body);
        doc.text(left, marginL, y);
        if (right) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(...C.muted);
          doc.text(right, marginL + maxW, y, { align: 'right' });
        }
        y += S(4.6);
      };

      const subLine = txt => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(S(9.5));
        doc.setTextColor(...C.muted);
        doc.text(txt, marginL, y);
        y += S(4.2);
      };

      const bullet = txt => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(S(9.5));
        doc.setTextColor(...C.body);
        const lines = doc.splitTextToSize(txt, maxW - 4);
        const startX = marginL + 3;
        lines.forEach((l, i) => {
          if (y > pageBottom && allowBreaks) { doc.addPage(); y = 14; }
          if (i === 0) {
            doc.setTextColor(...C.accent);
            doc.text('•', marginL, y);
            doc.setTextColor(...C.body);
            doc.text(l, startX, y);
          } else {
            doc.text(l, startX, y);
          }
          y += S(4);
        });
        y += S(0.5);
      };

      // Summary
      if (s.personal.summary) {
        sectionTitle('Summary');
        bodyText(s.personal.summary, 9.5);
        y += S(2);
      }

      // Experience
      if (s.experience.length) {
        sectionTitle('Work Experience');
        s.experience.forEach(e => {
          twoCol(e.role || 'Role', [e.start, e.end].filter(Boolean).join(' – '));
          if (e.company || e.location) subLine([e.company, e.location].filter(Boolean).join(' · '));
          (e.bullets || []).forEach(b => bullet(b));
          y += S(1);
        });
      }

      // Internship
      if (s.internship.length) {
        sectionTitle('Internship / Experience');
        s.internship.forEach(e => {
          twoCol(e.role || 'Role', [e.start, e.end].filter(Boolean).join(' – '));
          if (e.company) subLine(e.company);
          (e.bullets || []).forEach(b => bullet(b));
          y += S(1);
        });
      }

      // Projects
      if (s.projects.length) {
        sectionTitle('Projects');
        s.projects.forEach(p => {
          twoCol(p.name || 'Project', p.tech || '');
          if (p.link) subLine(p.link);
          if (p.desc) bodyText(p.desc, 9.5);
          y += S(0.5);
        });
      }

      // Education
      if (s.education.length) {
        sectionTitle('Education');
        s.education.forEach(e => {
          twoCol(e.degree || 'Degree', [e.start, e.end].filter(Boolean).join(' – '));
          subLine([e.school, e.score].filter(Boolean).join(' · '));
          y += S(0.5);
        });
      }

      // Skills
      if (s.skills.length) {
        sectionTitle('Skills');
        bodyText(s.skills.join(', '), 9.5);
        y += S(2);
      }

      // Certifications
      if (s.certifications.length) {
        sectionTitle('Certifications');
        s.certifications.forEach(c => {
          twoCol(c.name || 'Certification', c.year || '');
          if (c.issuer) subLine(c.issuer);
        });
      }

      // Achievements / POR / Languages / Interests
      if (s.achievements.length) {
        sectionTitle('Achievements');
        s.achievements.forEach(a => bullet(a));
        y += S(1);
      }
      if (s.por.length) {
        sectionTitle('Positions of Responsibility');
        bodyText(s.por.join(', '), 9.5);
        y += S(2);
      }
      if (s.languages.length) {
        sectionTitle('Languages');
        bodyText(s.languages.join(', '), 9.5);
        y += S(2);
      }
      if (s.interests.length) {
        sectionTitle('Interests');
        bodyText(s.interests.join(', '), 9.5);
      }

      return y;
    };

    // Pass 1: measure required height at scale 1
    const measure = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const needed = drawContent(measure, 1, false);
    let sc = Math.min(1, (pageH - 14) / Math.max(needed, 1));

    // Pass 2: render final doc with auto-scale so it stays on one page
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    drawContent(doc, sc, true);
    if (sc < 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('Auto-fitted to one page (scale ' + sc.toFixed(2) + ')', marginL, pageH - 6);
    }

    const filename = getFileName() + '.pdf';
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(doc.output('arraybuffer'));
        await writable.close();
      } catch (err) {
        if (err && err.name === 'AbortError') { /* user cancelled */ }
        else { doc.save(filename); }
      }
    } else {
      doc.save(filename);
    }
  } catch (err) {
    console.error(err);
    alert('PDF generation fail hui: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function downloadWord() {
  const btn = downloadBtn;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Generating Word...';
  try {
    const tpl = getTpl(BUILDER_STATE.active);
    const body = sheetHtml(getMergedState(), tpl);
    const css = await (await fetch('/style.css')).text();
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      esc(getFileName()) + '</title><style>' + css +
      ' @page{size:A4;margin:0}' +
      ' body{margin:0;padding:0}' +
      ' .resume-sheet{width:210mm;min-height:297mm;box-shadow:none;border-radius:0}' +
      '</style></head><body>' + body + '</body></html>';
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    saveBlob(blob, getFileName() + '.doc');
  } catch (err) {
    alert('Word generation fail hui: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// ---------- Print ----------
document.getElementById('printResume').addEventListener('click', () => {
  switchTab('builder');
  setTimeout(() => window.print(), 60);
});

// ---------- Init ----------
fillNonPersonal();
