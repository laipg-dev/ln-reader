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

// Tự động build bảng: alias 1 từ / tên ngắn → tên đầy đủ
// VD: "Ayanokoji" → "Kiyotaka Ayanokoji", "Kei" → "Kei Karuizawa"
function buildCharAliasMap() {
  const fullNames = CHARACTERS.filter((n) => n.includes(" "));
  const map = {};
  CHARACTERS.forEach((name) => {
    if (name.includes(" ")) {
      // Tên đầy đủ → map thẳng vào chính nó
      map[name.toLowerCase()] = name;
    } else {
      // Alias 1 từ → tìm tên đầy đủ đầu tiên chứa từ đó
      const match = fullNames.find((full) =>
        full
          .toLowerCase()
          .split(" ")
          .some((part) => part === name.toLowerCase()),
      );
      map[name.toLowerCase()] = match || name;
    }
  });
  return map;
}
const CHAR_ALIAS_MAP = buildCharAliasMap();

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

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  buildSidebar();
  renderLibraryOverview();
  attachEvents();

  if (window.innerWidth <= 768) closeSidebar();

  const saved = loadLastRead();
  if (saved) {
    openChapterByRef(saved.volId, saved.chapIdx);
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

async function openChapter(volId, chapIdx) {
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
  saveLastRead(volId, chapIdx);

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

  renderChapter(vol, chap, chapters, chapIdx);
  renderLibraryOverview();

  if (window.innerWidth <= 768) closeSidebar();
}

async function openChapterByRef(volId, chapIdx) {
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

  openChapter(volId, chapIdx);
}

function renderChapter(vol, chap, chapters, chapIdx) {
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

  prevBtn.disabled = chapIdx <= 0;
  nextBtn.disabled = chapIdx >= chapterCount - 1;

  prevBtn.onclick = () => openChapter(vol.id, chapIdx - 1);
  nextBtn.onclick = () => openChapter(vol.id, chapIdx + 1);

  updateTopbarChapter(vol.label, chap.title);
  hideLoading();
  showChapterView();
  window.scrollTo({ top: 0, behavior: "auto" });
  updateProgress();
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

function formatBody(raw, imagesDir) {
  const paragraphs = raw.split(/\n{2,}/);
  let html = "";

  paragraphs.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    const imgMatch = trimmed.match(
      /^\[(?:img|hình ảnh|hinh anh)\s*:\s*([^\]]+)\]$/iu,
    );
    if (imgMatch) {
      const rawPath = imgMatch[1].trim();
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

    if (trimmed.startsWith("## ")) {
      html += `<p class="section-title">${escHtml(trimmed.slice(3))}</p>`;
      return;
    }

    if (
      /^(Phan \d+|Mo dau|Ket thuc|Loi doc thoai|Ngoai truyen)\s*:/i.test(
        trimmed,
      ) &&
      trimmed.length < 80
    ) {
      html += `<span class="section-label">${escHtml(trimmed)}</span>`;
      return;
    }

    const lines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    let text = escHtml(lines.join("\n")).replace(/\n/g, "<br>");

    // Dùng placeholder để tránh tên ngắn bị wrap lồng vào tên dài.
    // VD: "Kei Karuizawa" xử lý trước → placeholder → "Kei" không match được nữa.
    const captured = [];
    const sortedChars = [...CHARACTERS].sort((a, b) => b.length - a.length);

    sortedChars.forEach((name) => {
      const re = new RegExp(`(${escRegex(name)})`, "g");
      text = text.replace(re, (match) => {
        const idx = captured.length;
        captured.push(match);
        return `\x00${idx}\x00`;
      });
    });

    // Chuyển placeholder → span thực
    text = text.replace(/\x00(\d+)\x00/g, (_, idx) => {
      return `<span class="char">${captured[+idx]}</span>`;
    });

    html += `<p>${text}</p>`;
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

function saveLastRead(volId, chapIdx) {
  localStorage.setItem("ln_lastRead", JSON.stringify({ volId, chapIdx }));
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
      openChapterByRef(saved.volId, saved.chapIdx);
    } else {
      expandSidebar();
    }
  });

  if (sidebarSearch) {
    sidebarSearch.addEventListener("input", (event) => {
      filterSidebar(event.target.value);
    });
  }

  window.addEventListener("scroll", updateProgress, { passive: true });

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

  initFocusMode();
  initBackToTop();
  initFabMenu();
  initLightbox();
  initCharPortrait();
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
    // iOS Safari cần fixed position để block scroll đúng cách
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.dataset.scrollY = scrollY;
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
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
  welcomeLastRead.innerHTML = `
    <span class="welcome-last-read-label">Dang doc tiep</span>
    <strong>${escHtml(vol.label)}</strong>
    <span>${chapter ? escHtml(chapter.title) : "Mo lai dung vi tri da luu"}</span>
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
      const src = dir + name + "." + exts[i];
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

    // iOS Safari cần fixed position để block scroll đúng cách
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.dataset.scrollY = scrollY;

    // Resolve alias → canonical full name for image lookup
    // VD: "Ayanokoji" → "Kiyotaka Ayanokoji"
    const canonicalName = CHAR_ALIAS_MAP[name.toLowerCase()] || name;

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
    // Restore scroll (iOS-safe)
    const savedY = parseInt(document.body.dataset.scrollY || "0", 10);
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, savedY);
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
