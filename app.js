// app.js — LN Reader (Volume-based, dynamic chapter parsing)
// ============================================================
// Luồng hoạt động:
//   1. Sidebar hiển thị Year → Volume (không cần biết chương trước)
//   2. Người dùng click Volume → fetch file .txt → parse chương
//   3. Chương được cache trong volumeCache để không fetch lại
//   4. lastRead lưu { volId, chapIdx } vào localStorage
// ============================================================

// ── Cache ────────────────────────────────────────────────────
// volumeCache[volId] = [ { title, body }, ... ]
const volumeCache = {};

// ── State ────────────────────────────────────────────────────
const state = {
  volId: null, // id của volume đang hiển thị
  chapIdx: -1, // index chương trong volume
  fontSize: parseInt(localStorage.getItem("ln_fontSize")) || 18,
  theme: localStorage.getItem("ln_theme") || "dark",
};

// ── DOM ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const sidebar = $("sidebar");
const sidebarContent = $("sidebarContent");
const sidebarOverlay = $("sidebarOverlay");
const sidebarToggle = $("sidebarToggle");
const welcome = $("welcome");
const chapterView = $("chapterView");
const chapterMeta = $("chapterMeta");
const chapterTitle = $("chapterTitle");
const chapterBody = $("chapterBody");
const loadingScreen = $("loadingScreen");
const themeBtn = $("themeBtn");
const fontIncBtn = $("fontIncBtn");
const fontDecBtn = $("fontDecBtn");
const readingProgress = $("readingProgress");
const welcomeOpenBtn = $("welcomeOpenBtn");

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  buildSidebar();
  attachEvents();

  if (window.innerWidth <= 768) closeSidebar();

  // Restore last read position
  const saved = loadLastRead();
  if (saved) {
    openChapterByRef(saved.volId, saved.chapIdx);
  } else {
    showWelcome();
  }
});

// ── Build Sidebar (static skeleton, chapters filled dynamically) ──
function buildSidebar() {
  let html = "";

  LIBRARY.forEach((year) => {
    html += `<div class="nav-year">${escHtml(year.label)}</div>`;

    year.volumes.forEach((vol) => {
      const isDefault = false; // no volume auto-expanded
      html += `
        <div class="nav-volume-header" onclick="handleVolumeClick('${vol.id}')">
          <div>
            <div class="nav-volume-name">${escHtml(vol.label)}</div>
            ${vol.translator ? `<div class="nav-volume-meta">Dịch: ${escHtml(vol.translator)}</div>` : ""}
          </div>
          <span class="nav-volume-arrow" id="arrow-${vol.id}">▶</span>
        </div>
        <div class="nav-chapter-list" id="chaplist-${vol.id}"></div>
      `;
    });
  });

  sidebarContent.innerHTML = html;
}

// ── Handle Volume Click: load if needed, then toggle ─────────
async function handleVolumeClick(volId) {
  const vol = findVol(volId);
  if (!vol) return;

  const listEl = document.getElementById(`chaplist-${volId}`);
  const arrowEl = document.getElementById(`arrow-${volId}`);
  const isOpen = listEl.classList.contains("open");

  // If already open → collapse and return
  if (isOpen) {
    listEl.classList.remove("open");
    arrowEl.classList.remove("open");
    return;
  }

  // If not yet loaded → fetch + parse
  if (!volumeCache[volId]) {
    listEl.innerHTML = `<div class="nav-chapter-loading">Đang tải…</div>`;
    listEl.classList.add("open");
    arrowEl.classList.add("open");

    try {
      console.log(vol.file);
      const raw = await fetchText(vol.file);
      volumeCache[volId] = parseChapters(raw);
    } catch (err) {
      listEl.innerHTML = `<div class="nav-chapter-error">⚠ Không tải được file</div>`;
      console.error(err);
      return;
    }
  }

  // Render chapter list
  renderChapterList(volId);
  listEl.classList.add("open");
  arrowEl.classList.add("open");
}

// ── Render chapter buttons inside a volume's list ─────────────
function renderChapterList(volId) {
  const listEl = document.getElementById(`chaplist-${volId}`);
  const chapters = volumeCache[volId];
  if (!chapters) return;

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

// ── Open chapter by volId + chapIdx ──────────────────────────
async function openChapter(volId, chapIdx) {
  const vol = findVol(volId);
  if (!vol) return;

  // Load volume if not cached
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

  // Update state
  const prevVolId = state.volId;
  const prevChapIdx = state.chapIdx;
  state.volId = volId;
  state.chapIdx = chapIdx;

  saveLastRead(volId, chapIdx);

  // Refresh old active chapter button
  if (prevVolId) {
    const prevBtn = document.getElementById(
      `navchap-${prevVolId}-${prevChapIdx}`,
    );
    if (prevBtn) prevBtn.classList.remove("active");
  }

  // Ensure this volume is open in sidebar + refresh list
  const listEl = document.getElementById(`chaplist-${volId}`);
  const arrowEl = document.getElementById(`arrow-${volId}`);
  if (listEl && !listEl.classList.contains("open")) {
    listEl.classList.add("open");
    arrowEl && arrowEl.classList.add("open");
  }
  renderChapterList(volId); // re-render to set active state

  // Scroll active chapter into view in sidebar
  const activeBtn = document.getElementById(`navchap-${volId}-${chapIdx}`);
  if (activeBtn)
    activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });

  // Render chapter content
  renderChapter(vol, chap, chapters, chapIdx);

  // Close sidebar on mobile
  if (window.innerWidth <= 768) closeSidebar();
}

// Wrapper used for restoring last read (may need to load volume first)
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
      showWelcome();
      return;
    }
  }
  openChapter(volId, chapIdx);
}

// ── Render chapter into reader pane ──────────────────────────
function renderChapter(vol, chap, chapters, chapIdx) {
  const year = findYearByVolId(vol.id);

  chapterMeta.textContent = [
    year ? year.label : "",
    vol.label,
    vol.translator ? "Dịch: " + vol.translator : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  chapterTitle.textContent = chap.title;
  chapterBody.innerHTML = formatBody(chap.body, vol.imagesDir);

  // Prev / Next
  const prevBtn = $("prevBtn");
  const nextBtn = $("nextBtn");

  prevBtn.disabled = chapIdx <= 0;
  nextBtn.disabled = chapIdx >= chapters.length - 1;

  prevBtn.onclick = () => openChapter(vol.id, chapIdx - 1);
  nextBtn.onclick = () => openChapter(vol.id, chapIdx + 1);

  hideLoading();
  showChapterView();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderFetchError(vol, err) {
  chapterMeta.textContent = vol.label;
  chapterTitle.textContent = "Không thể tải file";
  chapterBody.innerHTML = `
    <p style="color:var(--accent); font-family:var(--font-display); font-size:14px;">
      ⚠ Lỗi khi tải: <code>${escHtml(vol.file)}</code><br>
      <span style="font-size:12px; opacity:0.7">${escHtml(String(err))}</span>
    </p>
    <p style="margin-top:16px; font-size:14px; color:var(--text-muted); line-height:1.8;">
      Kiểm tra lại:<br>
      • File tồn tại đúng đường dẫn chưa?<br>
      • Đang chạy qua local server chưa? (<code>python3 -m http.server</code>)<br>
      • Tên file/folder có dấu/khoảng cách có khớp chính xác không?
    </p>`;
  hideLoading();
  showChapterView();
}

// ── Parse .txt → array of { title, body } ────────────────────
// Quy tắc: mỗi chương bắt đầu bằng dòng "# Tiêu đề"
function parseChapters(raw) {
  // Normalize line endings
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const chapters = [];
  let current = null;

  lines.forEach((line) => {
    if (/^#\s+/.test(line)) {
      // New chapter heading
      if (current) chapters.push(current);
      current = {
        title: line
          .replace(/^#+\s+/, "")
          .replace(/\*\*/g, "")
          .trim(),
        body: "",
      };
    } else {
      if (!current) {
        // Text before first heading → treat as a preamble chapter
        current = { title: "Mở đầu", body: "" };
      }
      current.body += line + "\n";
    }
  });

  if (current && (current.body.trim() || current.title !== "Mở đầu")) {
    chapters.push(current);
  }

  return chapters;
}

// ── Format body text → HTML ───────────────────────────────────
// Supports:
//   [img:filename]   → <img> tag using imagesDir
//   ## Subtitle      → section heading
//   Phần X: ...      → section label
//   blank line       → paragraph break
function formatBody(raw, imagesDir) {
  const paragraphs = raw.split(/\n{2,}/);
  let html = "";

  paragraphs.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    // ── Image reference ──────────────────────────────────────
    // Matches [img:some_file.png] optionally surrounded by whitespace on the line
    const imgMatch = trimmed.match(/^\[(?:img|hình ảnh)\s*:\s*([^\]]+)\]$/iu);
    if (imgMatch) {
      const rawPath = imgMatch[1].trim();

      // Nếu trong txt ghi images/image_1.jpeg thì bỏ images/ đi
      const filename = rawPath.replace(/^images\//i, "").trim();

      const src = imagesDir.replace(/\/?$/, "/") + filename;

      html += `
    <figure class="chapter-img">
      <img src="${escAttr(src)}" alt="${escAttr(filename)}"
           loading="lazy"
           onerror="console.error('Image load failed:', this.src); this.parentElement.classList.add('img-error')" />
    </figure>`;
      return;
    }

    // ── Section heading (##) ─────────────────────────────────
    if (trimmed.startsWith("## ")) {
      html += `<p class="section-title">${escHtml(trimmed.slice(3))}</p>`;
      return;
    }

    // ── Section label (Phần X: / Mở đầu: / etc.) ────────────
    if (
      /^(Phần \d+|Mở đầu|Kết thúc|Lời độc thoại|Ngoại truyện)\s*:/i.test(
        trimmed,
      ) &&
      trimmed.length < 80
    ) {
      html += `<span class="section-label">${escHtml(trimmed)}</span>`;
      return;
    }

    // ── Normal paragraph ─────────────────────────────────────
    // Handle soft line breaks within a paragraph block
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let text = escHtml(lines.join("\n")).replace(/\n/g, "<br>");

    // Highlight character names
    CHARACTERS.forEach((name) => {
      const re = new RegExp(`(${escRegex(name)})`, "g");
      text = text.replace(re, `<span class="char">$1</span>`);
    });

    html += `<p>${text}</p>`;
  });

  return html || "<p>Nội dung trống.</p>";
}

// ── Fetch helper ──────────────────────────────────────────────
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return await res.text();
}

// ── Lookup helpers ────────────────────────────────────────────
function findVol(volId) {
  for (const year of LIBRARY)
    for (const vol of year.volumes) if (vol.id === volId) return vol;
  return null;
}

function findYearByVolId(volId) {
  return LIBRARY.find((y) => y.volumes.some((v) => v.id === volId)) || null;
}

// ── localStorage ─────────────────────────────────────────────
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

// ── Show/Hide helpers ─────────────────────────────────────────
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
}

// ── Sidebar ───────────────────────────────────────────────────
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

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "☀" : "☾";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(state.theme);
  localStorage.setItem("ln_theme", state.theme);
}

// ── Font size ─────────────────────────────────────────────────
function applyFontSize(size) {
  document.documentElement.style.setProperty("--font-size", size + "px");
}

function changeFontSize(delta) {
  state.fontSize = Math.min(24, Math.max(14, state.fontSize + delta));
  applyFontSize(state.fontSize);
  localStorage.setItem("ln_fontSize", state.fontSize);
}

// ── Reading progress ──────────────────────────────────────────
function updateProgress() {
  const doc = document.documentElement;
  const total = doc.scrollHeight - doc.clientHeight;
  readingProgress.style.width =
    (total > 0 ? (window.scrollY / total) * 100 : 0) + "%";
}

// ── Events ────────────────────────────────────────────────────
function attachEvents() {
  sidebarToggle.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);
  themeBtn.addEventListener("click", toggleTheme);
  fontIncBtn.addEventListener("click", () => changeFontSize(1));
  fontDecBtn.addEventListener("click", () => changeFontSize(-1));
  welcomeOpenBtn.addEventListener("click", expandSidebar);
  window.addEventListener("scroll", updateProgress, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight") $("nextBtn")?.click();
    if (e.key === "ArrowLeft") $("prevBtn")?.click();
    if (e.key === "b" || e.key === "B") toggleSidebar();
    if (e.key === "d" || e.key === "D") toggleTheme();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebarOverlay.classList.remove("visible");
      sidebar.classList.remove("mobile-open");
    }
  });
}

// ── Utility ───────────────────────────────────────────────────
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
/* ================================================================
   app.js ADDITIONS — Thêm vào cuối file app.js hiện có
   Bao gồm: sepia, focus mode, lightbox, back-to-top, FAB, topbar chapter
   ================================================================ */

/* ── Sepia Mode ─────────────────────────────────────────────── */
(function initSepia() {
  const btn = document.getElementById("sepiaBtn");
  if (!btn) return;

  // Restore saved sepia
  if (localStorage.getItem("cote-sepia") === "1") {
    document.body.classList.add("sepia");
    // Remove dark if sepia is active
    document.body.classList.remove("dark");
    btn.classList.add("active");
  }

  btn.addEventListener("click", () => {
    const isSepia = document.body.classList.toggle("sepia");
    if (isSepia) {
      document.body.classList.remove("dark");
      localStorage.setItem("cote-sepia", "1");
      localStorage.removeItem("cote-theme");
      btn.classList.add("active");
    } else {
      localStorage.removeItem("cote-sepia");
      btn.classList.remove("active");
    }
  });
})();

/* ── Focus Mode ─────────────────────────────────────────────── */
(function initFocusMode() {
  const btn = document.getElementById("focusBtn");
  if (!btn) return;

  let scrollTimeout;
  let lastScrollY = window.scrollY;

  // Show topbar briefly after scroll stops
  function onScroll() {
    document.body.classList.add("scrolled");
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      document.body.classList.remove("scrolled");
    }, 1500);
    lastScrollY = window.scrollY;
  }

  btn.addEventListener("click", () => {
    const active = document.body.classList.toggle("focus-mode");
    btn.classList.toggle("active", active);
    if (active) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      window.removeEventListener("scroll", onScroll);
      document.body.classList.remove("scrolled");
    }
  });
})();

/* ── Back To Top FAB ─────────────────────────────────────────── */
(function initBackToTop() {
  const fab = document.getElementById("fabBackTop");
  const inlineBtn = document.getElementById("backTopBtn");
  if (!fab) return;

  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY > 400) {
        fab.classList.add("visible");
      } else {
        fab.classList.remove("visible");
      }
    },
    { passive: true },
  );

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  fab.addEventListener("click", scrollTop);
  if (inlineBtn) inlineBtn.addEventListener("click", scrollTop);
})();

/* ── FAB Menu (mobile sidebar toggle) ────────────────────────── */
(function initFabMenu() {
  const fab = document.getElementById("fabMenu");
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (!fab || !sidebarToggle) return;

  fab.addEventListener("click", () => {
    sidebarToggle.click();
  });
})();

/* ── Lightbox for chapter images ─────────────────────────────── */
(function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const closeBtn = document.getElementById("lightboxClose");
  if (!lightbox || !lightboxImg) return;

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  }

  // Delegate click on dynamically rendered chapter images
  document.getElementById("chapterBody").addEventListener("click", (e) => {
    const img = e.target.closest("img");
    if (img) openLightbox(img.src, img.alt);
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("open"))
      closeLightbox();
  });
})();

/* ── Topbar chapter name ─────────────────────────────────────── */
// Call this function after a chapter loads.
// In your existing loadChapter() function, add:
//   updateTopbarChapter(volumeName, chapterTitle);
function updateTopbarChapter(volumeName, chapterTitle) {
  const el = document.getElementById("topbarChapter");
  if (!el) return;
  if (volumeName && chapterTitle) {
    el.textContent = volumeName + " · " + chapterTitle;
    el.classList.add("visible");
  } else {
    el.textContent = "";
    el.classList.remove("visible");
  }
}

// Auto-hook: watch chapterMeta and chapterTitle for changes (no app.js source needed)
(function hookTopbarChapter() {
  const meta = document.getElementById("chapterMeta");
  const title = document.getElementById("chapterTitle");
  if (!meta || !title) return;

  const observer = new MutationObserver(() => {
    const metaText = meta.textContent.trim();
    const titleText = title.textContent.trim();
    updateTopbarChapter(metaText, titleText);
  });

  observer.observe(meta, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  observer.observe(title, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();

/* ── Auto-close sidebar on chapter select (mobile) ───────────── */
// Patch: wrap existing chapter click handler to also close sidebar on mobile.
// If your app.js already calls a function like loadChapter(), you can add this there.
// Alternatively this MutationObserver auto-detects chapter changes:
(function autoCloseSidebarOnMobile() {
  const chapterView = document.getElementById("chapterView");
  if (!chapterView) return;

  const observer = new MutationObserver(() => {
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById("sidebar");
      const overlay = document.getElementById("sidebarOverlay");
      const toggle = document.getElementById("sidebarToggle");
      if (sidebar && sidebar.classList.contains("mobile-open")) {
        sidebar.classList.remove("mobile-open");
        if (overlay) overlay.classList.remove("visible");
        if (toggle) toggle.classList.remove("open");
        document.body.style.overflow = "";
      }
    }
  });

  observer.observe(chapterView, {
    attributes: true,
    attributeFilter: ["style"],
  });
})();
