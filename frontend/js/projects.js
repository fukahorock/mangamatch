// frontend/js/projects.js — Bootstrapデザインそのまま対応版（非モジュール）
// - /api/auth/session で認証チェック（未ログインなら /login へ）
// - /data/projects.json を読み込み、Bootstrapカードで表示
// - 検索・進捗フィルタ・並び順・ページサイズ・ページング・タグ絞り込み対応

(() => {
  async function getSession() {
    try {
      const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { authenticated: false };
      return await r.json();
    } catch { return { authenticated: false }; }
  }
  function setUser(u) {
    const name = (u && (u.username || u.name)) || "（未ログイン）";
    ["userName","userNameSide","userNameOff"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = name;
    });
  }

  async function loadProjects() {
    const res = await fetch("/data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error("projects.json load failed");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("projects.json must be an array");
    return data;
  }

  const esc = (s="") => String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmt = (iso)=>{ try{ return new Date(iso).toLocaleDateString(); }catch{ return iso||""; } };

  function cardHTML(p){
    const tags = (p.tags||[]).map(t=>`<span class="mm-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join("");
    const badge = p.progress ? `<span class="badge text-bg-secondary ${p.progress==='募集終了'?'badge-closed':''}">${esc(p.progress)}</span>` : "";
    const sub = [p.magazines, p.cadenceAndPages, p.goodFor].filter(Boolean).join("／");
    const summary = p.summary ? `<div class="mm-label mt-2">${esc(p.summary)}</div>` : "";
    const notes = p.notes ? `<div class="mm-note mt-2">${esc(p.notes)}</div>` : "";
    return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card mm-card h-100">
        <div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <h5 class="card-title mb-1">${esc(p.title || p.projectName || "(no title)")}</h5>
            ${badge}
          </div>
          <div class="mm-label mb-1">${esc(p.projectName || "")}</div>
          <div class="mm-label">${esc(sub || "-")}</div>
          <div class="mt-2">${tags}</div>
          ${summary}
          ${notes}
          <div class="mt-auto mm-label pt-2">最終更新：${fmt(p.updatedAt)}</div>
        </div>
      </div>
    </div>`;
  }

  // 状態
  let ALL = []; let view = [];
  let activeTag = ""; let page = 1; let pageSize = 6;
  const selected = new Set(); // 将来用（カード選択するときに使う）

  // 参照
  const $ = s => document.querySelector(s);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const pagerEl = $("#pager");
  const stickyBar = $("#stickyBar");
  const selectedCount = $("#count");

  const searchInput = $("#searchInput");
  const filterProgress = $("#filterProgress");
  const sortOrder = $("#sortOrder");
  const pageSizeSel = $("#pageSize");
  const clearFiltersBtn = $("#clearFilters");

  const activeTagBar = $("#activeTagBar");
  const activeTagSpan = $("#activeTag");
  const clearTagBtn = $("#clearTagBtn");

  function applyFilters(){
    const kw = (searchInput?.value || "").trim().toLowerCase();
    const prog = filterProgress?.value || "";

    view = ALL.filter(p=>{
      if (activeTag && !(p.tags||[]).includes(activeTag)) return false;
      if (kw) {
        const blob = [
          p.title, p.projectName, p.progress, p.magazines,
          p.cadenceAndPages, p.goodFor, p.summary, p.notes, ...(p.tags||[])
        ].filter(Boolean).join(" ").toLowerCase();
        if (!blob.includes(kw)) return false;
      }
      if (prog && p.progress !== prog) return false;
      return true;
    });

    const dir = sortOrder?.value || "desc";
    view.sort((a,b)=>{
      const va = a.updatedAt || "";
      const vb = b.updatedAt || "";
      return dir==="asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const sizeVal = pageSizeSel?.value || "6";
    pageSize = sizeVal==="all" ? Infinity : parseInt(sizeVal,10)||6;
    const maxPage = Math.max(1, Math.ceil(view.length / (isFinite(pageSize)?pageSize:Math.max(view.length,1))));
    if (page > maxPage) page = 1;

    render();
  }

  function render(){
    let slice = view;
    if (isFinite(pageSize)) {
      const start = (page-1)*pageSize;
      slice = view.slice(start, start + pageSize);
    }
    listEl.innerHTML = slice.map(cardHTML).join("");
    emptyEl.classList.toggle("d-none", view.length>0);

    renderPager();

    // タグクリック（デリゲート）
    listEl.onclick = (e)=>{
      const t = e.target.closest(".mm-chip");
      if (t) {
        activeTag = t.getAttribute("data-tag") || "";
        activeTagSpan.textContent = activeTag;
        activeTagBar.classList.remove("d-none");
        page = 1;
        applyFilters();
      }
    };

    // 選択バー（将来用）
    selectedCount.textContent = String(selected.size);
    stickyBar.style.display = selected.size>0 ? "block" : "none";
  }

  function renderPager(){
    if (!pagerEl) return;
    if (!isFinite(pageSize)) { pagerEl.innerHTML=""; return; }
    const total = view.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    let html = "";
    const mk = (p, label, disabled=false, active=false) =>
      `<li class="page-item ${disabled?'disabled':''} ${active?'active':''}">
         <a class="page-link" href="#" data-page="${p}">${label}</a></li>`;
    html += mk(page-1,"«", page<=1);
    for(let i=1;i<=pages;i++){ html += mk(i, String(i), false, i===page); }
    html += mk(page+1,"»", page>=pages);
    pagerEl.innerHTML = html;
    pagerEl.onclick = (e)=>{
      const a = e.target.closest("[data-page]");
      if (!a) return;
      e.preventDefault();
      const p = parseInt(a.getAttribute("data-page"),10);
      if (!isNaN(p)) { page = p; render(); }
    };
  }

  function wireEvents(){
    searchInput?.addEventListener("input", ()=>{ page=1; applyFilters(); });
    filterProgress?.addEventListener("change", ()=>{ page=1; applyFilters(); });
    sortOrder?.addEventListener("change", ()=>{ page=1; applyFilters(); });
    pageSizeSel?.addEventListener("change", ()=>{ page=1; applyFilters(); });
    clearFiltersBtn?.addEventListener("click", ()=>{
      searchInput.value=""; filterProgress.value=""; sortOrder.value="desc"; pageSizeSel.value="6";
      activeTag=""; activeTagBar.classList.add("d-none");
      page=1; applyFilters();
    });
    clearTagBtn?.addEventListener("click", ()=>{
      activeTag=""; activeTagBar.classList.add("d-none"); page=1; applyFilters();
    });

    // 送信モーダル（ダミー）
    const submitForm = document.getElementById("submitForm");
    submitForm?.addEventListener("submit",(ev)=>{
      ev.preventDefault();
      console.log("選択送信（ダミー）", Array.from(selected));
      const modalEl = document.getElementById("submitModal");
      if (modalEl && window.bootstrap) {
        const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        m.hide();
      }
    });
    const openModalBtn = document.getElementById("openModalBtn");
    openModalBtn?.addEventListener("click", ()=>{
      const ul = document.getElementById("selectedList");
      if (ul) ul.innerHTML = `<div class="small text-muted">（未実装：カード選択機能を後で追加）</div>`;
      const modalEl = document.getElementById("submitModal");
      if (modalEl && window.bootstrap) {
        const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        m.show();
      }
    });
  }

  (async function init(){
    const sess = await getSession();
    if (!sess.authenticated) { location.replace("/login"); return; }
    setUser(sess.user);

    try { ALL = await loadProjects(); } catch (e) { console.error(e); ALL = []; }

    wireEvents();
    applyFilters();
  })();
})();
