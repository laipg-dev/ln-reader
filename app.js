// app.js — LN Reader
// ============================================================
// Sidebar builds from Year -> Volume.
// Chapters are parsed lazily from each volume text file.
// Reader state is kept in localStorage for theme, font size, and last read.
// ============================================================

const volumeCache = {};
const THEME_ORDER = ["dark", "light", "sepia"];

// ── Character portrait config ──────────────────────────────
// ⚠️  Đổi đường dẫn này cho đúng với folder ảnh nhân vật của bạn.
//    Ví dụ: "characters/"  hoặc  "images/characters/"
const CHARACTERS_IMG_DIR = "characters/";
const CHARACTERS_IMG_EXTS = ["png", "jpg", "jpeg", "webp"];

// File danh sách tên được trích xuất từ truyện.
// Mỗi dòng 1 tên. File này giúp highlight tên trong nội dung truyện.
const CHARACTER_NAME_TXT = "danh_sach_ten.txt";

// Những alias bắt buộc để xử lý các cách phiên âm / gõ khác nhau.
// Key phải viết thường, không dấu, theo normalizeNameForMatch().
const MANUAL_NAME_ALIASES = {
  ayanokouji: "Kiyotaka Ayanokoji",
  ayanokoji: "Kiyotaka Ayanokoji",
  kiyotaka: "Kiyotaka Ayanokoji",

  ryuuen: "Kakeru Ryuuen",
  ryuen: "Kakeru Ryuuen",
  kakeru: "Kakeru Ryuuen",

  ryuji: "Ryuuji Kanzaki",
  ryuuji: "Ryuuji Kanzaki",

  kouenji: "Rokusuke Koenji",
  koenji: "Rokusuke Koenji",
  rokusuke: "Rokusuke Koenji",

  sudou: "Ken Sudo",
  sudo: "Ken Sudo",
  ken: "Ken Sudo",

  housen: "Kazuomi Hosen",
  hosen: "Kazuomi Hosen",
  kazuomi: "Kazuomi Hosen",

  kiryuuin: "Fuka Kiryuin",
  kiryuin: "Fuka Kiryuin",
  fuuka: "Fuka Kiryuin",
  fuka: "Fuka Kiryuin",

  honami: "Honami Ichinose",
  ichinose: "Honami Ichinose",

  kei: "Kei Karuizawa",
  karuizawa: "Kei Karuizawa",

  horikita: "Suzune Horikita",
  suzune: "Suzune Horikita",
  manabu: "Manabu Horikita",

  kushida: "Kikyo Kushida",
  kikyo: "Kikyo Kushida",

  sakayanagi: "Arisu Sakayanagi",
  arisu: "Arisu Sakayanagi",

  nanase: "Tsubasa Nanase",
  tsubasa: "Tsubasa Nanase",

  yagami: "Takuya Yagami",
  takuya: "Takuya Yagami",

  ibuki: "Mio Ibuki",
  mio: "Mio Ibuki",

  chabashira: "Sae Chabashira",
  sae: "Sae Chabashira",

  hoshinomiya: "Chie Hoshinomiya",
  chie: "Chie Hoshinomiya",

  mashima: "Tomonari Mashima",
  tomonari: "Tomonari Mashima",

  amasawa: "Ichika Amasawa",
  ichika: "Ichika Amasawa",

  shiina: "Hiyori Shiina",
  hiyori: "Hiyori Shiina",

  nagumo: "Miyabi Nagumo",
  miyabi: "Miyabi Nagumo",
};

let CHAR_ALIAS_MAP = {};
let CHAR_HIGHLIGHT_NAMES = [];
let CHAR_IMAGE_NAMES = [];

function normalizeNameForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(normalizeRomajiToken)
    .join(" ");
}

function normalizeRomajiToken(token) {
  return token
    .replace(/ou/g, "o")
    .replace(/uu/g, "u")
    .replace(/oo/g, "o")
    .replace(/ii/g, "i");
}

function cleanDisplayName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueNames(names) {
  const map = new Map();

  names.forEach((name) => {
    const clean = cleanDisplayName(name);
    if (!clean) return;

    const key = normalizeNameForMatch(clean);
    if (!key) return;

    if (!map.has(key)) map.set(key, clean);
  });

  return [...map.values()];
}

async function loadNamesFromTxt(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const text = await res.text();
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function initCharacterMatching() {
  const namesFromTxt = await loadNamesFromTxt(CHARACTER_NAME_TXT);

  // IMAGE_CHARACTERS lấy từ image_characters.js.
  // Nếu chưa có file đó thì fallback sang các tên đầy đủ trong CHARACTERS.
  const imageNames =
    typeof IMAGE_CHARACTERS !== "undefined" && Array.isArray(IMAGE_CHARACTERS)
      ? IMAGE_CHARACTERS
      : CHARACTERS.filter((name) => name.includes(" "));

  CHAR_IMAGE_NAMES = uniqueNames(imageNames);

  const candidates = uniqueNames([
    ...CHARACTERS,
    ...namesFromTxt,
    ...Object.keys(MANUAL_NAME_ALIASES),
  ]);

  CHAR_ALIAS_MAP = buildFuzzyAliasMap(candidates, CHAR_IMAGE_NAMES);

  // Chỉ highlight những tên có thể map tới ảnh hoặc alias thủ công.
  // Cách này tự loại các từ tiếng Việt không dấu như: nghe, so, yo, vai...
  CHAR_HIGHLIGHT_NAMES = candidates
    .filter((name) => isReliableCharacterAlias(name))
    .sort((a, b) => b.length - a.length);
}

function buildFuzzyAliasMap(aliasNames, imageNames) {
  const map = {};

  aliasNames.forEach((alias) => {
    const aliasKey = normalizeNameForMatch(alias);
    if (!aliasKey) return;

    if (MANUAL_NAME_ALIASES[aliasKey]) {
      map[aliasKey] = MANUAL_NAME_ALIASES[aliasKey];
      return;
    }

    const best = findBestCharacterImageName(alias, imageNames);
    if (best) map[aliasKey] = best;
  });

  return map;
}

function isReliableCharacterAlias(name) {
  const key = normalizeNameForMatch(name);
  if (!key) return false;
  if (MANUAL_NAME_ALIASES[key]) return true;
  if (CHAR_ALIAS_MAP[key]) return true;

  return CHAR_IMAGE_NAMES.some(
    (imageName) => normalizeNameForMatch(imageName) === key,
  );
}

function levenshtein(a, b) {
  a = normalizeNameForMatch(a);
  b = normalizeNameForMatch(b);

  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

function similarity(a, b) {
  a = normalizeNameForMatch(a);
  b = normalizeNameForMatch(b);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

function isCloseToken(a, b) {
  a = normalizeNameForMatch(a);
  b = normalizeNameForMatch(b);

  if (!a || !b) return false;
  if (a === b) return true;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);

  // Tên quá ngắn như Kei, Ken, Mio phải match chính xác để tránh nhầm.
  if (maxLen <= 3) return distance === 0;

  // Tên 4 đến 5 chữ cho phép sai 1 ký tự.
  if (maxLen <= 5) return distance <= 1;

  // Tên dài hơn cho phép sai 1 đến 2 ký tự.
  return distance <= 2 || similarity(a, b) >= 0.88;
}

function scoreCharacterCandidate(inputName, imageName) {
  const input = normalizeNameForMatch(inputName);
  const image = normalizeNameForMatch(imageName);

  if (!input || !image) return 0;
  if (input === image) return 1;

  const inputTokens = input.split(" ");
  const imageTokens = image.split(" ");

  const wholeScore = similarity(input, image);
  let bestTokenTotal = 0;
  let matchedTokenCount = 0;

  inputTokens.forEach((inputToken) => {
    let bestTokenScore = 0;

    imageTokens.forEach((imageToken) => {
      const tokenScore = similarity(inputToken, imageToken);
      if (tokenScore > bestTokenScore) bestTokenScore = tokenScore;
      if (isCloseToken(inputToken, imageToken)) matchedTokenCount += 1;
    });

    bestTokenTotal += bestTokenScore;
  });

  const avgTokenScore = bestTokenTotal / inputTokens.length;
  let finalScore = Math.max(wholeScore, avgTokenScore);

  // Tên trong truyện 1 chữ: chỉ cần gần đúng với 1 phần của tên ảnh.
  if (inputTokens.length === 1 && matchedTokenCount >= 1) {
    finalScore = Math.max(finalScore, 0.92);
  }

  // Tên trong truyện có từ 2 chữ: match được ít nhất 2 token thì rất chắc.
  if (inputTokens.length >= 2 && matchedTokenCount >= 2) {
    finalScore = Math.max(finalScore, 0.97);
  }

  return finalScore;
}

function findBestCharacterImageName(inputName, imageNames = CHAR_IMAGE_NAMES) {
  const inputKey = normalizeNameForMatch(inputName);
  if (!inputKey) return null;

  if (MANUAL_NAME_ALIASES[inputKey]) return MANUAL_NAME_ALIASES[inputKey];

  let bestName = null;
  let bestScore = 0;

  imageNames.forEach((imageName) => {
    const score = scoreCharacterCandidate(inputName, imageName);
    if (score > bestScore) {
      bestScore = score;
      bestName = imageName;
    }
  });

  return bestScore >= 0.9 ? bestName : null;
}

function buildNameRegex(name) {
  const parts = cleanDisplayName(name)
    .split(/\s+/)
    .map(escRegex)
    .join("\\s+");

  // Không match bên trong chữ khác.
  // Ví dụ: Kei không match trong một từ dài hơn.
  return new RegExp(`(^|[^A-Za-z])(${parts})(?=$|[^A-Za-z])`, "gi");
}

const state = {
  volId: null,
  chapIdx: -1,
  fontSize: parseInt(localStorage.getItem("ln_fontSize"), 10) || 18,
  theme: localStorage.getItem("ln_theme") || "dark",
};

const $ = (id) => document.getElementById(id);

const sidebar = $("sidebar");
const sidebarContent = $("sidebarContent");
const sidebarOverlay = $("sidebarOverlay");
const sidebarToggle = $("sidebarToggle");
const welcome = $("welcome");
const chapterView = $("chapterView");
const chapterMeta = $("chapterMeta");
const chapterTitle = $("chapterTitle");
const chapterContext = $("chapterContext");
const chapterBody = $("chapterBody");
const loadingScreen = $("loadingScreen");
const themeBtn = $("themeBtn");
const sepiaBtn = $("sepiaBtn");
const focusBtn = $("focusBtn");
const fontIncBtn = $("fontIncBtn");
const fontDecBtn = $("fontDecBtn");
const readingProgress = $("readingProgress");
const welcomeOpenBtn = $("welcomeOpenBtn");
const welcomeContinueBtn = $("welcomeContinueBtn");
const sidebarSearch = $("sidebarSearch");
const sidebarCount = $("sidebarCount");
const welcomeStats = $("welcomeStats");
const welcomeLastRead = $("welcomeLastRead");
const topbarChapter = $("topbarChapter");

let readingBlockObserver = null;
let isRestoringReadingPosition = false;
let lastSavedScrollAt = 0;

document.addEventListener("DOMContentLoaded", async () => {
  await initCharacterMatching();

  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  buildSidebar();
  renderLibraryOverview();
  attachEvents();

  if (window.innerWidth <= 768) closeSidebar();

  const saved = loadLastRead();
  if (saved) {
    openChapterByRef(saved.volId, saved.chapIdx, { restorePosition: true });
  } else {
    showWelcome();
  }
});

function buildSidebar() {
  let html = "";

  LIBRARY.forEach((year) => {
    const yearSearch = `${year.label} ${year.volumes.map((vol) => vol.label).join(" ")}`;
    html += `
      <section class="nav-year-group" data-year-search="${escAttr(yearSearch.toLowerCase())}">
        <div class="nav-year">${escHtml(year.label)}</div>
    `;

    year.volumes.forEach((vol) => {
      const searchText =
        `${year.label} ${vol.label} ${vol.translator || ""}`.toLowerCase();
      html += `
        <div class="nav-volume-block" data-search="${escAttr(searchText)}">
          <div class="nav-volume-header" data-vol-id="${escAttr(vol.id)}" onclick="handleVolumeClick('${vol.id}')">
            <div>
              <div class="nav-volume-name">${escHtml(vol.label)}</div>
              ${vol.translator ? `<div class="nav-volume-meta">Dich: ${escHtml(vol.translator)}</div>` : ""}
            </div>
            <span class="nav-volume-arrow" id="arrow-${vol.id}">▶</span>
          </div>
          <div class="nav-chapter-list" id="chaplist-${vol.id}"></div>
        </div>
      `;
    });

    html += `</section>`;
  });

  sidebarContent.innerHTML = html;
  updateSidebarCount(
    LIBRARY.reduce((sum, year) => sum + year.volumes.length, 0),
  );
}

async function handleVolumeClick(volId) {
  const vol = findVol(volId);
  if (!vol) return;

  const listEl = document.getElementById(`chaplist-${volId}`);
  const arrowEl = document.getElementById(`arrow-${volId}`);
  const isOpen = listEl.classList.contains("open");

  if (isOpen) {
    listEl.classList.remove("open");
    arrowEl.classList.remove("open");
    return;
  }

  if (!volumeCache[volId]) {
    listEl.innerHTML = `<div class="nav-chapter-loading">Dang tai...</div>`;
    listEl.classList.add("open");
    arrowEl.classList.add("open");

    try {
      const raw = await fetchText(vol.file);
      volumeCache[volId] = parseChapters(raw);
    } catch (err) {
      listEl.innerHTML = `<div class="nav-chapter-error">Khong tai duoc file</div>`;
      console.error(err);
      return;
    }
  }

  renderChapterList(volId);
  listEl.classList.add("open");
  arrowEl.classList.add("open");
}

function renderChapterList(volId) {
  const listEl = document.getElementById(`chaplist-${volId}`);
  const chapters = volumeCache[volId];
  if (!listEl || !chapters) return;

  let html = "";
  chapters.forEach((chap, idx) => {
    const isActive = state.volId === volId && state.chapIdx === idx;
    html += `
      <button
        class="nav-chapter${isActive ? " active" : ""}"
        id="navchap-${volId}-${idx}"
        onclick="openChapter('${volId}', ${idx})"
      >${escHtml(chap.title)}</button>
    `;
  });

  listEl.innerHTML = html;
}

async function openChapter(volId, chapIdx, options = {}) {
  const vol = findVol(volId);
  if (!vol) return;

  if (!volumeCache[volId]) {
    showLoading();
    try {
      const raw = await fetchText(vol.file);
      volumeCache[volId] = parseChapters(raw);
    } catch (err) {
      renderFetchError(vol, err);
      return;
    }
  }

  const chapters = volumeCache[volId];
  const chap = chapters[chapIdx];
  if (!chap) return;

  const prevVolId = state.volId;
  const prevChapIdx = state.chapIdx;
  state.volId = volId;
  state.chapIdx = chapIdx;
  if (!options.restorePosition) {
    saveLastRead(volId, chapIdx, 0, 0);
  }

  if (prevVolId) {
    const prevBtn = document.getElementById(
      `navchap-${prevVolId}-${prevChapIdx}`,
    );
    if (prevBtn) prevBtn.classList.remove("active");
  }

  const listEl = document.getElementById(`chaplist-${volId}`);
  const arrowEl = document.getElementById(`arrow-${volId}`);
  if (listEl && !listEl.classList.contains("open")) {
    listEl.classList.add("open");
    if (arrowEl) arrowEl.classList.add("open");
  }

  renderChapterList(volId);
  updateActiveVolumeHeader();

  const activeBtn = document.getElementById(`navchap-${volId}-${chapIdx}`);
  if (activeBtn)
    activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });

  renderChapter(vol, chap, chapters, chapIdx, options);
  renderLibraryOverview();

  if (window.innerWidth <= 768) closeSidebar();
}

async function openChapterByRef(volId, chapIdx, options = {}) {
  showLoading();
  const vol = findVol(volId);
  if (!vol) {
    showWelcome();
    return;
  }

  if (!volumeCache[volId]) {
    try {
      const raw = await fetchText(vol.file);
      volumeCache[volId] = parseChapters(raw);
    } catch (err) {
      console.error(err);
      showWelcome();
      return;
    }
  }

  openChapter(volId, chapIdx, options);
}

function renderChapter(vol, chap, chapters, chapIdx, options = {}) {
  const year = findYearByVolId(vol.id);
  const chapterCount = chapters.length;
  const estimate = estimateReadingMinutes(chap.body);

  chapterMeta.textContent = [
    year ? year.label : "",
    vol.label,
    vol.translator ? "Dich: " + vol.translator : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  chapterTitle.textContent = chap.title;
  chapterContext.innerHTML = `
    <span>Chuong ${chapIdx + 1}/${chapterCount}</span>
    <span>~${estimate} phut doc</span>
    <span>Tu dong luu vi tri</span>
  `;
  chapterBody.innerHTML = formatBody(chap.body, vol.imagesDir);

  const prevBtn = $("prevBtn");
  const nextBtn = $("nextBtn");

  const hasPrev = hasAdjacentChapter(vol.id, chapIdx, -1, chapterCount);
  const hasNext = hasAdjacentChapter(vol.id, chapIdx, 1, chapterCount);
  const nextGoesToAnotherVolume = chapIdx >= chapterCount - 1 && Boolean(findAdjacentVolume(vol.id, 1));
  const prevGoesToAnotherVolume = chapIdx <= 0 && Boolean(findAdjacentVolume(vol.id, -1));

  prevBtn.disabled = !hasPrev;
  nextBtn.disabled = !hasNext;
  prevBtn.textContent = prevGoesToAnotherVolume ? "← Volume trước" : "← Chương trước";
  nextBtn.textContent = nextGoesToAnotherVolume ? "Volume tiếp →" : "Chương tiếp →";

  prevBtn.onclick = () => openAdjacentChapter(vol.id, chapIdx, -1);
  nextBtn.onclick = () => openAdjacentChapter(vol.id, chapIdx, 1);

  updateTopbarChapter(vol.label, chap.title);
  hideLoading();
  showChapterView();
  setupReadingPositionTracking();

  const saved = loadLastRead();
  const shouldRestore =
    options.restorePosition &&
    saved &&
    saved.volId === vol.id &&
    saved.chapIdx === chapIdx;

  if (shouldRestore) {
    restoreReadingPosition(saved);
  } else {
    window.scrollTo({ top: 0, behavior: "auto" });
    setActiveReadingBlock(0, { save: true, scroll: false });
  }

  updateProgress();
}

function flattenVolumes() {
  return LIBRARY.flatMap((year) => year.volumes);
}

function findAdjacentVolume(volId, direction) {
  const volumes = flattenVolumes();
  const index = volumes.findIndex((vol) => vol.id === volId);

  if (index === -1) return null;

  return volumes[index + direction] || null;
}

function hasAdjacentChapter(volId, chapIdx, direction, currentChapterCount) {
  if (direction > 0) {
    return chapIdx < currentChapterCount - 1 || Boolean(findAdjacentVolume(volId, 1));
  }

  return chapIdx > 0 || Boolean(findAdjacentVolume(volId, -1));
}

async function ensureVolumeLoaded(volId) {
  const vol = findVol(volId);
  if (!vol) return null;

  if (!volumeCache[volId]) {
    showLoading();
    const raw = await fetchText(vol.file);
    volumeCache[volId] = parseChapters(raw);
  }

  return volumeCache[volId];
}

async function openAdjacentChapter(volId, chapIdx, direction) {
  const currentChapters = volumeCache[volId] || [];

  if (direction > 0) {
    if (chapIdx < currentChapters.length - 1) {
      openChapter(volId, chapIdx + 1);
      return;
    }

    const nextVol = findAdjacentVolume(volId, 1);
    if (!nextVol) return;

    try {
      await ensureVolumeLoaded(nextVol.id);
      openChapter(nextVol.id, 0);
    } catch (err) {
      renderFetchError(nextVol, err);
    }
    return;
  }

  if (chapIdx > 0) {
    openChapter(volId, chapIdx - 1);
    return;
  }

  const prevVol = findAdjacentVolume(volId, -1);
  if (!prevVol) return;

  try {
    const prevChapters = await ensureVolumeLoaded(prevVol.id);
    if (!prevChapters || !prevChapters.length) return;
    openChapter(prevVol.id, prevChapters.length - 1);
  } catch (err) {
    renderFetchError(prevVol, err);
  }
}

function renderFetchError(vol, err) {
  chapterMeta.textContent = vol.label;
  chapterTitle.textContent = "Khong the tai file";
  chapterContext.innerHTML = "";
  chapterBody.innerHTML = `
    <p style="color:var(--accent); font-family:var(--font-display); font-size:14px;">
      Loi khi tai: <code>${escHtml(vol.file)}</code><br>
      <span style="font-size:12px; opacity:0.7">${escHtml(String(err))}</span>
    </p>
    <p style="margin-top:16px; font-size:14px; color:var(--text-muted); line-height:1.8;">
      Kiem tra duong dan file va chay bang local server de fetch noi dung.
    </p>
  `;
  hideLoading();
  showChapterView();
}

function parseChapters(raw) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const chapters = [];
  let current = null;

  lines.forEach((line) => {
    if (/^#\s+/.test(line)) {
      if (current) chapters.push(current);
      current = {
        title: line
          .replace(/^#+\s+/, "")
          .replace(/\*\*/g, "")
          .trim(),
        body: "",
      };
    } else {
      if (!current) current = { title: "Mo dau", body: "" };
      current.body += line + "\n";
    }
  });

  if (current && (current.body.trim() || current.title !== "Mo dau")) {
    chapters.push(current);
  }

  return chapters;
}


function normalizeBlockText(block) {
  return String(block || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function classifyTextBlock(block, previousSpeaker = "") {
  const text = normalizeBlockText(block);

  if (!text) return { type: "empty", text: "" };

  const imgMatch = text.match(
    /^\[(?:img|hình ảnh|hinh anh)\s*:\s*([^\]]+)\]$/iu,
  );

  if (imgMatch) {
    return { type: "image", src: imgMatch[1].trim(), text };
  }

  if (text.startsWith("## ")) {
    return { type: "section", text: text.slice(3).trim() };
  }

  if (
    /^(Phần|Phan)\s+\d+\s*:/i.test(text) ||
    /^(Mở đầu|Mo dau|Kết thúc|Ket thuc|Lời độc thoại|Loi doc thoai|Ngoại truyện|Ngoai truyen)\s*:/i.test(text)
  ) {
    if (text.length < 100) return { type: "label", text };
  }

  const speaker = guessDialogueSpeaker(text) || "";

  if (isDialogueBlock(text)) {
    return { type: "dialogue", speaker, text: cleanDialogueText(text) };
  }

  if (isInnerMonologueBlock(text)) {
    return { type: "inner-monologue", speaker: "Ayanokouji", text };
  }

  if (isMainPovBlock(text)) {
    return { type: "main-pov", speaker: "Ayanokouji", text };
  }

  if (isThirdPersonBlock(text)) {
    return { type: "third-person", text };
  }

  return { type: "narration", text };
}

function isDialogueBlock(text) {
  const trimmed = text.trim();
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);

  if (!trimmed) return false;

  // Dạng: - Cậu nói gì vậy?
  // Dạng: “Cậu nói gì vậy?” hoặc 「Cậu nói gì vậy?」
  if (/^[\-–—]\s+/.test(trimmed)) return true;
  if (/^["“”'‘’「『]/.test(trimmed)) return true;

  const dialogueLineCount = lines.filter((line) =>
    /^[\-–—]\s+/.test(line) || /^["“”'‘’「『]/.test(line),
  ).length;

  if (lines.length >= 2 && dialogueLineCount / lines.length >= 0.6) {
    return true;
  }

  // Dạng: Horikita: Cậu đang làm gì vậy?
  const colonSpeaker = trimmed.match(
    /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s*[:：]\s+(.+)/,
  );

  if (colonSpeaker && findBestCharacterImageName(colonSpeaker[1])) {
    return true;
  }

  if (/^["“「『].+["”」』]\s*[,，.]?\s*/s.test(trimmed)) {
    return true;
  }

  return false;
}

function cleanDialogueText(text) {
  return normalizeBlockText(text)
    .replace(/^[\-–—]\s*/gm, "")
    .replace(/^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s*[:：]\s+/, "")
    .trim();
}

function isInnerMonologueBlock(text) {
  const trimmed = text.trim();
  const normalized = normalizeNameForMatch(trimmed);

  if (/^\(.+\)$/.test(trimmed)) return true;
  if (/^<.+>$/.test(trimmed)) return true;

  const innerMarkers = [
    "toi nghi",
    "toi tu hoi",
    "toi tu nhu",
    "toi tu noi",
    "toi tham nghi",
    "trong dau toi",
    "trong long toi",
    "trong tam tri toi",
    "toi nhan ra",
    "toi cam thay",
    "co le toi",
    "minh nghi",
    "minh tu hoi",
    "minh phai",
  ];

  return innerMarkers.some((marker) => normalized.includes(marker));
}

function isMainPovBlock(text) {
  const normalized = ` ${normalizeNameForMatch(text)} `;

  // Truyện chủ yếu đi theo góc nhìn Ayanokouji.
  // Các đoạn có đại từ ngôi thứ nhất được đánh dấu nhẹ là POV chính.
  return /\s(toi|ta|minh|to)\s/.test(normalized);
}

function isThirdPersonBlock(text) {
  const normalized = ` ${normalizeNameForMatch(text)} `;

  if (isMainPovBlock(text)) return false;

  const thirdPersonMarkers = [
    " anh ay ",
    " co ay ",
    " cau ay ",
    " cau ta ",
    " co ta ",
    " anh ta ",
    " ong ta ",
    " ba ta ",
    " han ",
    " ho ",
    " bon ho ",
    " nguoi do ",
  ];

  if (thirdPersonMarkers.some((marker) => normalized.includes(marker))) {
    return true;
  }

  // Nếu đoạn không phải hội thoại và không có ngôi thứ nhất,
  // xem như đoạn mô tả / góc nhìn thứ ba ở mức hiển thị nhẹ.
  return text.length >= 70;
}

function guessDialogueSpeaker(text) {
  const colonSpeaker = text.trim().match(
    /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s*[:：]\s+/,
  );

  if (colonSpeaker) {
    const resolved = resolveCharacterDisplayName(colonSpeaker[1]);
    if (resolved) return resolved;
  }

  const normalizedText = normalizeNameForMatch(text);
  if (!normalizedText) return "";

  const speechVerbs = [
    "noi",
    "hoi",
    "dap",
    "tra loi",
    "len tieng",
    "thi tham",
    "lam bam",
    "noi tiep",
    "goi",
    "cuoi noi",
    "ngat loi",
    "xen vao",
    "tho dai",
  ];

  const candidates = uniqueNames([
    ...CHAR_HIGHLIGHT_NAMES,
    ...CHAR_IMAGE_NAMES,
    ...Object.keys(MANUAL_NAME_ALIASES),
  ]).sort((a, b) => b.length - a.length);

  for (const name of candidates) {
    const key = normalizeNameForMatch(name);
    if (!key) continue;

    const nameThenVerb = speechVerbs.some((verb) =>
      normalizedText.includes(`${key} ${verb}`),
    );

    const verbThenName = speechVerbs.some((verb) =>
      normalizedText.includes(`${verb} ${key}`),
    );

    if (nameThenVerb || verbThenName) {
      return resolveCharacterDisplayName(name) || cleanDisplayName(name);
    }
  }

  return "";
}

function resolveCharacterDisplayName(name) {
  const clean = cleanDisplayName(name);
  const key = normalizeNameForMatch(clean);

  if (!key) return "";

  return CHAR_ALIAS_MAP[key] || findBestCharacterImageName(clean) || clean;
}

function highlightCharacterNames(text) {
  const captured = [];
  const sortedChars = [...CHAR_HIGHLIGHT_NAMES].sort(
    (a, b) => b.length - a.length,
  );

  sortedChars.forEach((name) => {
    const re = buildNameRegex(name);

    text = text.replace(re, (fullMatch, prefix, matchedName) => {
      const idx = captured.length;
      captured.push(matchedName);
      return `${prefix}\x00${idx}\x00`;
    });
  });

  return text.replace(/\x00(\d+)\x00/g, (_, idx) => {
    return `<span class="char">${captured[+idx]}</span>`;
  });
}

function renderTextBlock(blockInfo, blockIndex) {
  const type = blockInfo.type || "narration";
  const safeType = escAttr(type);
  const className =
    type === "dialogue"
      ? "dialogue"
      : type === "inner-monologue"
        ? "inner-monologue"
        : type === "main-pov"
          ? "main-pov"
          : type === "third-person"
            ? "third-person"
            : "narration";

  let text = escHtml(blockInfo.text).replace(/\n/g, "<br>");
  text = highlightCharacterNames(text);

  if (type === "dialogue") {
    const speaker = blockInfo.speaker ? escHtml(blockInfo.speaker) : "";
    return `
      <p id="reading-block-${blockIndex}" class="reading-block ${className}" data-block-index="${blockIndex}" data-block-type="${safeType}">
        ${speaker ? `<span class="dialogue-speaker">${speaker}</span>` : ""}
        <span class="dialogue-text">${text}</span>
      </p>
    `;
  }

  if (type === "inner-monologue") {
    return `
      <p id="reading-block-${blockIndex}" class="reading-block ${className}" data-block-index="${blockIndex}" data-block-type="${safeType}">
        <span class="thought-label">Ayanokouji nghĩ</span>
        ${text}
      </p>
    `;
  }

  return `
    <p id="reading-block-${blockIndex}" class="reading-block ${className}" data-block-index="${blockIndex}" data-block-type="${safeType}">${text}</p>
  `;
}

function formatBody(raw, imagesDir) {
  const paragraphs = raw.split(/\n{2,}/);
  let html = "";
  let blockIndex = 0;

  paragraphs.forEach((block) => {
    const trimmed = normalizeBlockText(block);
    if (!trimmed) return;

    const blockInfo = classifyTextBlock(trimmed);

    if (blockInfo.type === "image") {
      const rawPath = blockInfo.src.trim();
      const filename = rawPath.replace(/^images\//i, "").trim();
      const src = imagesDir.replace(/\/?$/, "/") + filename;

      html += `
        <figure class="chapter-img">
          <img
            src="${escAttr(src)}"
            alt="${escAttr(filename)}"
            loading="lazy"
            onerror="console.error('Image load failed:', this.src); this.parentElement.classList.add('img-error')"
          />
        </figure>
      `;
      return;
    }

    if (blockInfo.type === "section") {
      html += `<p class="section-title">${escHtml(blockInfo.text)}</p>`;
      return;
    }

    if (blockInfo.type === "label") {
      html += `<span class="section-label">${escHtml(blockInfo.text)}</span>`;
      return;
    }


    html += renderTextBlock(blockInfo, blockIndex);
    blockIndex += 1;
  });

  return html || "<p>Noi dung trong.</p>";
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return await res.text();
}

function findVol(volId) {
  for (const year of LIBRARY) {
    for (const vol of year.volumes) {
      if (vol.id === volId) return vol;
    }
  }
  return null;
}

function findYearByVolId(volId) {
  return (
    LIBRARY.find((year) => year.volumes.some((vol) => vol.id === volId)) || null
  );
}

function saveLastRead(volId, chapIdx, blockIndex = null, scrollY = window.scrollY) {
  const parsedBlockIndex =
    blockIndex === null || blockIndex === undefined
      ? null
      : parseInt(blockIndex, 10);

  const safeBlockIndex = Number.isFinite(parsedBlockIndex)
    ? parsedBlockIndex
    : null;

  const safeScrollY = Number.isFinite(scrollY)
    ? Math.max(0, Math.round(scrollY))
    : 0;

  localStorage.setItem(
    "ln_lastRead",
    JSON.stringify({
      volId,
      chapIdx,
      blockIndex: safeBlockIndex,
      scrollY: safeScrollY,
      savedAt: Date.now(),
    }),
  );
}

function loadLastRead() {
  try {
    const raw = localStorage.getItem("ln_lastRead");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showLoading() {
  welcome.style.display = "none";
  chapterView.style.display = "none";
  loadingScreen.style.display = "flex";
}

function hideLoading() {
  loadingScreen.style.display = "none";
}

function showChapterView() {
  welcome.style.display = "none";
  chapterView.style.display = "block";
}

function showWelcome() {
  welcome.style.display = "flex";
  chapterView.style.display = "none";
  loadingScreen.style.display = "none";
  updateTopbarChapter("", "");
}

function closeSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("visible");
    sidebarToggle.classList.remove("open");
  } else {
    sidebar.classList.add("collapsed");
    sidebarToggle.classList.remove("open");
  }
}

function expandSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.add("mobile-open");
    sidebarOverlay.classList.add("visible");
    sidebarToggle.classList.add("open");
  } else {
    sidebar.classList.remove("collapsed");
    sidebarToggle.classList.add("open");
  }
}

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.contains("mobile-open")
      ? closeSidebar()
      : expandSidebar();
  } else {
    sidebar.classList.contains("collapsed") ? expandSidebar() : closeSidebar();
  }
}

function applyTheme(theme) {
  document.body.classList.remove("dark", "sepia");

  if (theme === "dark") {
    document.body.classList.add("dark");
  } else if (theme === "sepia") {
    document.body.classList.add("sepia");
  }

  themeBtn.textContent = theme === "dark" ? "☀" : theme === "light" ? "◐" : "☾";
  themeBtn.title =
    theme === "dark"
      ? "Chuyen sang giao dien sang"
      : theme === "light"
        ? "Chuyen sang giao dien sepia"
        : "Chuyen sang giao dien toi";

  sepiaBtn.classList.toggle("active", theme === "sepia");
  sepiaBtn.textContent = theme === "sepia" ? "S" : "◑";
}

function setTheme(theme) {
  state.theme = THEME_ORDER.includes(theme) ? theme : "dark";
  applyTheme(state.theme);
  localStorage.setItem("ln_theme", state.theme);
}

function toggleTheme() {
  const currentIndex = THEME_ORDER.indexOf(state.theme);
  const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
  setTheme(THEME_ORDER[nextIndex]);
}

function toggleSepiaTheme() {
  setTheme(state.theme === "sepia" ? "dark" : "sepia");
}

function applyFontSize(size) {
  document.documentElement.style.setProperty("--font-size", `${size}px`);
}

function changeFontSize(delta) {
  state.fontSize = Math.min(24, Math.max(14, state.fontSize + delta));
  applyFontSize(state.fontSize);
  localStorage.setItem("ln_fontSize", String(state.fontSize));
}

function updateProgress() {
  const doc = document.documentElement;
  const total = doc.scrollHeight - doc.clientHeight;
  const percentage = total > 0 ? (window.scrollY / total) * 100 : 0;
  readingProgress.style.width = `${percentage}%`;
}

function attachEvents() {
  sidebarToggle.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);
  themeBtn.addEventListener("click", toggleTheme);
  sepiaBtn.addEventListener("click", toggleSepiaTheme);
  fontIncBtn.addEventListener("click", () => changeFontSize(1));
  fontDecBtn.addEventListener("click", () => changeFontSize(-1));
  welcomeOpenBtn.addEventListener("click", expandSidebar);
  welcomeContinueBtn.addEventListener("click", () => {
    const saved = loadLastRead();
    if (saved) {
      openChapterByRef(saved.volId, saved.chapIdx, { restorePosition: true });
    } else {
      expandSidebar();
    }
  });

  if (sidebarSearch) {
    sidebarSearch.addEventListener("input", (event) => {
      filterSidebar(event.target.value);
    });
  }

  window.addEventListener(
    "scroll",
    () => {
      updateProgress();
      saveReadingPositionFromScroll();
    },
    { passive: true },
  );

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (event.key === "ArrowRight") $("nextBtn")?.click();
    if (event.key === "ArrowLeft") $("prevBtn")?.click();
    if (event.key === "b" || event.key === "B") toggleSidebar();
    if (event.key === "d" || event.key === "D") toggleTheme();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebarOverlay.classList.remove("visible");
      sidebar.classList.remove("mobile-open");
    }
  });

  initReadingBlockInteractions();
  initFocusMode();
  initBackToTop();
  initFabMenu();
  initLightbox();
  initCharPortrait();
}

function initReadingBlockInteractions() {
  if (!chapterBody) return;

  chapterBody.addEventListener("click", (event) => {
    if (event.target.closest(".char")) return;
    if (event.target.closest("img")) return;

    const block = event.target.closest(".reading-block");
    if (!block) return;

    const blockIndex = parseInt(block.dataset.blockIndex, 10);
    if (!Number.isFinite(blockIndex)) return;

    setActiveReadingBlock(blockIndex, { save: true, scroll: false });
  });
}

function setupReadingPositionTracking() {
  if (readingBlockObserver) {
    readingBlockObserver.disconnect();
    readingBlockObserver = null;
  }

  const blocks = getReadingBlocks();
  if (!blocks.length) return;

  readingBlockObserver = new IntersectionObserver(
    (entries) => {
      if (isRestoringReadingPosition) return;

      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => {
          const aDistance = Math.abs(a.boundingClientRect.top - window.innerHeight * 0.28);
          const bDistance = Math.abs(b.boundingClientRect.top - window.innerHeight * 0.28);
          return aDistance - bDistance;
        });

      if (!visibleEntries.length) return;

      const blockIndex = parseInt(visibleEntries[0].target.dataset.blockIndex, 10);
      if (!Number.isFinite(blockIndex)) return;

      setActiveReadingBlock(blockIndex, { save: true, scroll: false });
    },
    {
      root: null,
      rootMargin: "-22% 0px -62% 0px",
      threshold: [0, 0.12, 0.35, 0.6],
    },
  );

  blocks.forEach((block) => readingBlockObserver.observe(block));
}

function getReadingBlocks() {
  return Array.from(chapterBody.querySelectorAll(".reading-block[data-block-index]"));
}

function getClosestReadingBlock() {
  const blocks = getReadingBlocks();
  if (!blocks.length) return null;

  let bestBlock = blocks[0];
  let bestDistance = Infinity;
  const targetY = window.innerHeight * 0.3;

  blocks.forEach((block) => {
    const rect = block.getBoundingClientRect();
    const distance = Math.abs(rect.top - targetY);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestBlock = block;
    }
  });

  return bestBlock;
}

function setActiveReadingBlock(blockIndex, options = {}) {
  const save = options.save !== false;
  const shouldScroll = options.scroll === true;
  const target = chapterBody.querySelector(
    `.reading-block[data-block-index="${blockIndex}"]`,
  );

  if (!target) return;

  chapterBody
    .querySelectorAll(".active-reading-block")
    .forEach((block) => block.classList.remove("active-reading-block"));

  target.classList.add("active-reading-block");

  if (shouldScroll) {
    target.scrollIntoView({ block: "center", behavior: "auto" });
  }

  if (save && state.volId && state.chapIdx >= 0) {
    saveLastRead(state.volId, state.chapIdx, blockIndex, window.scrollY);
  }
}

function restoreReadingPosition(saved) {
  isRestoringReadingPosition = true;

  requestAnimationFrame(() => {
    const blockIndex =
      saved.blockIndex === null || saved.blockIndex === undefined
        ? null
        : parseInt(saved.blockIndex, 10);

    const target = Number.isFinite(blockIndex)
      ? chapterBody.querySelector(`.reading-block[data-block-index="${blockIndex}"]`)
      : null;

    if (target) {
      setActiveReadingBlock(blockIndex, { save: false, scroll: true });
    } else if (Number.isFinite(saved.scrollY)) {
      window.scrollTo({ top: Math.max(0, saved.scrollY), behavior: "auto" });
      const closest = getClosestReadingBlock();
      if (closest) {
        const closestIndex = parseInt(closest.dataset.blockIndex, 10);
        if (Number.isFinite(closestIndex)) {
          setActiveReadingBlock(closestIndex, { save: false, scroll: false });
        }
      }
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
      setActiveReadingBlock(0, { save: false, scroll: false });
    }

    window.setTimeout(() => {
      isRestoringReadingPosition = false;
      saveReadingPositionFromScroll(true);
      updateProgress();
    }, 250);
  });
}

function saveReadingPositionFromScroll(force = false) {
  if (isRestoringReadingPosition) return;
  if (!state.volId || state.chapIdx < 0) return;
  if (!chapterView || chapterView.style.display === "none") return;

  const now = Date.now();
  if (!force && now - lastSavedScrollAt < 700) return;
  lastSavedScrollAt = now;

  const activeBlock =
    chapterBody.querySelector(".active-reading-block") || getClosestReadingBlock();

  const blockIndex = activeBlock
    ? parseInt(activeBlock.dataset.blockIndex, 10)
    : null;

  saveLastRead(
    state.volId,
    state.chapIdx,
    Number.isFinite(blockIndex) ? blockIndex : null,
    window.scrollY,
  );
}

function initFocusMode() {
  if (!focusBtn) return;

  let scrollTimeout;

  function onScroll() {
    document.body.classList.add("scrolled");
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      document.body.classList.remove("scrolled");
    }, 1500);
  }

  focusBtn.addEventListener("click", () => {
    const active = document.body.classList.toggle("focus-mode");
    focusBtn.classList.toggle("active", active);
    if (active) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      window.removeEventListener("scroll", onScroll);
      document.body.classList.remove("scrolled");
    }
  });
}

function initBackToTop() {
  const fab = $("fabBackTop");
  const inlineBtn = $("backTopBtn");
  if (!fab) return;

  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY > 400) fab.classList.add("visible");
      else fab.classList.remove("visible");
    },
    { passive: true },
  );

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  fab.addEventListener("click", scrollTop);
  if (inlineBtn) inlineBtn.addEventListener("click", scrollTop);
}

function initFabMenu() {
  const fab = $("fabMenu");
  if (!fab || !sidebarToggle) return;
  fab.addEventListener("click", () => sidebarToggle.click());
}

function initLightbox() {
  const lightbox = $("lightbox");
  const lightboxImg = $("lightboxImg");
  const closeBtn = $("lightboxClose");
  if (!lightbox || !lightboxImg) return;

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.classList.add("open");

    // Do not lock scroll with position: fixed here.
    // That can make the page jump to the top, then back to the old position.
    document.body.classList.add("modal-open");
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.classList.remove("modal-open");
  }

  chapterBody.addEventListener("click", (event) => {
    const img = event.target.closest("img");
    if (img) openLightbox(img.src, img.alt);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("open")) {
      closeLightbox();
    }
  });
}

function updateTopbarChapter(volumeName, chapterName) {
  if (!topbarChapter) return;

  if (volumeName && chapterName) {
    topbarChapter.textContent = `${volumeName} · ${chapterName}`;
    topbarChapter.classList.add("visible");
  } else {
    topbarChapter.textContent = "";
    topbarChapter.classList.remove("visible");
  }
}

function renderLibraryOverview() {
  const yearCount = LIBRARY.length;
  const volumeCount = LIBRARY.reduce(
    (sum, year) => sum + year.volumes.length,
    0,
  );

  if (welcomeStats) {
    welcomeStats.innerHTML = `
      <span><strong>${yearCount}</strong> nam hoc</span>
      <span><strong>${volumeCount}</strong> volume</span>
    `;
  }

  const saved = loadLastRead();
  if (!saved || !welcomeLastRead) return;

  const vol = findVol(saved.volId);
  if (!vol) return;

  const chapter = volumeCache[saved.volId]?.[saved.chapIdx];
  const blockText = Number.isInteger(saved.blockIndex)
    ? ` · doan ${saved.blockIndex + 1}`
    : "";

  welcomeLastRead.innerHTML = `
    <span class="welcome-last-read-label">Dang doc tiep</span>
    <strong>${escHtml(vol.label)}</strong>
    <span>${chapter ? escHtml(chapter.title) : "Mo lai dung vi tri da luu"}${escHtml(blockText)}</span>
  `;
}

function filterSidebar(query) {
  const normalized = query.trim().toLowerCase();
  const volumeBlocks = Array.from(
    document.querySelectorAll(".nav-volume-block"),
  );
  const yearGroups = Array.from(document.querySelectorAll(".nav-year-group"));

  let visibleCount = 0;

  volumeBlocks.forEach((block) => {
    const matched = !normalized || block.dataset.search.includes(normalized);
    block.classList.toggle("is-hidden", !matched);
    if (matched) visibleCount += 1;
  });

  yearGroups.forEach((group) => {
    const hasVisibleChild = Array.from(
      group.querySelectorAll(".nav-volume-block"),
    ).some((block) => !block.classList.contains("is-hidden"));
    group.classList.toggle("is-hidden", !hasVisibleChild);
  });

  updateSidebarCount(visibleCount);
}

function updateSidebarCount(count) {
  if (!sidebarCount) return;
  sidebarCount.textContent = `${count} volume`;
}

function updateActiveVolumeHeader() {
  document.querySelectorAll(".nav-volume-header").forEach((header) => {
    header.classList.toggle("has-active", header.dataset.volId === state.volId);
  });
}

function estimateReadingMinutes(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Character Portrait Popup ───────────────────────────────
function initCharPortrait() {
  const popup = $("charPopup");
  const backdrop = $("charPopupBackdrop");
  const closeBtn = $("charPopupClose");
  const img = $("charPopupImg");
  const ph = $("charPopupPlaceholder"); // placeholder ?
  const nameEl = $("charPopupName");
  if (!popup || !backdrop) return;

  let currentName = "";

  // Try loading an image by trying each extension in order
  function tryLoadImage(name, exts, callback) {
    const dir = CHARACTERS_IMG_DIR.replace(/\/?$/, "/");
    // Chỉ thử đúng tên đầy đủ (alias đã được resolve bởi CHAR_ALIAS_MAP)
    const attempt = (i) => {
      if (i >= exts.length) {
        callback(null);
        return;
      }
      const src = dir + encodeURIComponent(name) + "." + exts[i];
      const probe = new Image();
      probe.onload = () => callback(src);
      probe.onerror = () => attempt(i + 1);
      probe.src = src;
    };
    attempt(0);
  }

  function openPopup(name, anchorEl) {
    currentName = name;
    nameEl.textContent = name;

    // Reset image state
    img.classList.remove("loaded");
    img.src = "";
    ph.classList.remove("hidden");

    popup.classList.remove("open");
    backdrop.classList.add("open");
    popup.setAttribute("aria-hidden", "false");

    // Position on desktop near the clicked element
    positionPopup(anchorEl);

    // Small delay so CSS transition plays after position is set
    requestAnimationFrame(() => popup.classList.add("open"));

    // Do not lock scroll with position: fixed here.
    // That can make the page jump to the top, then back to the old position.
    document.body.classList.add("modal-open");

    // Resolve alias / tên lệch chính tả → tên file ảnh gần đúng nhất.
    // VD: "Ryuen" hoặc "RYuuen" → "Kakeru Ryuuen".
    const nameKey = normalizeNameForMatch(name);
    const canonicalName =
      CHAR_ALIAS_MAP[nameKey] || findBestCharacterImageName(name) || name;

    // Load image asynchronously using canonical name
    tryLoadImage(canonicalName, CHARACTERS_IMG_EXTS, (src) => {
      if (currentName !== name) return; // stale if user opened another
      if (src) {
        img.src = src;
        img.alt = canonicalName;
        img.classList.add("loaded");
        ph.classList.add("hidden");
      }
    });
  }

  function closePopup() {
    popup.classList.remove("open");
    backdrop.classList.remove("open");
    popup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    currentName = "";
  }

  function positionPopup(anchorEl) {
    if (window.innerWidth <= 600) return; // CSS handles centering on mobile

    const POPUP_W = 240;
    const POPUP_H = 310;
    const MARGIN = 12;
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below-right of word; fall back to left / above as needed
    let left = rect.left + rect.width / 2 - POPUP_W / 2;
    let top = rect.bottom + MARGIN;

    if (left + POPUP_W > vw - MARGIN) left = vw - POPUP_W - MARGIN;
    if (left < MARGIN) left = MARGIN;
    if (top + POPUP_H > vh - MARGIN) top = rect.top - POPUP_H - MARGIN;
    if (top < MARGIN) top = MARGIN;

    popup.style.left = left + "px";
    popup.style.top = top + "px";
  }

  // Click on character name spans (event delegation)
  // Dùng cả "click" và "touchend" để đảm bảo hoạt động trên iOS Safari
  function handleCharTap(e) {
    const span = e.target.closest(".char");
    if (!span) return;
    e.preventDefault();
    e.stopPropagation();
    const name = span.textContent.trim();
    if (name === currentName && popup.classList.contains("open")) {
      closePopup();
    } else {
      openPopup(name, span);
    }
  }

  chapterBody.addEventListener("click", handleCharTap);
  chapterBody.addEventListener("touchend", handleCharTap, { passive: false });

  // Close on backdrop / close button / Escape
  backdrop.addEventListener("click", closePopup);
  closeBtn.addEventListener("click", closePopup);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popup.classList.contains("open")) closePopup();
  });
}
