// Bootstrapデザイン準拠版（非モジュール）
// 変更点:
// - カードは常に横2（col-12 col-md-6）
// - summary を通常の本文スタイルに
// - progress バッジを色分け（success/info/warning/danger/secondary）
// - projectName と progress を改行（別ブロック）
// - goodFor を強調（太字＋やや大きめ）
// - 各カードに「選択/選択中」ボタンを復活
// - 下部の「選んでフカホリに伝える」バーとモーダル連携を復活
// - サイドバーのログアウトも対応（#logout / #logoutSide があれば動作）

(() => {
  // ---------------------------
  // Auth
  // ---------------------------
  async function getSession() {
    try {
      const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { authenticated: false };
      return await r.json();
    } catch { return { authenticated: false }; }
  }
  function bindLogout() {
    const go = () => { location.href = "/api/auth/logout"; };
    document.getElementById("logout")?.addEventListener("click", go);
    document.getElementById("logoutSide")?.addEventListener("click", go);
  }
  function setUser(u) {
    const name = (u && (u.username || u.name)) || "（未ログイン）";
    ["userName","userNameSide","userNameOff"].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = name;
    });
  }

  // ---------------------------
  // Data
  // ---------------------------
  async function loadProjects() {
    const res = await fetch("/data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error("projects.json load failed");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("projects.json must be an array");
    return data;
  }

  // ---------------------------
  // View helpers
  // ---------------------------
  const esc = (s="") => String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmt = (iso)=>{ try{ return new Date(iso).toLocaleDateString(); }catch{ return iso||""; } };

  function progressClass(text="") {
    const t = String(text);
    if (/(決定|採用|確定)/.test(t)) return "success";
    if (/(入賞|受賞|コンペ|選考|審査)/.test(t)) return "info";
    if (/(募集|案内|募集中|一緒に)/.test(t)) return "warning";
    if (/(注意|危険)/.test(t)) return "danger";
    if (/(終了|締切|停止)/.test(t)) return "secondary";
    return "secondary";
  }

  function cardHTML(p){
    const tags = (p.tags||[]).map(t=>`<span class="mm-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join("");

    // progress は別ブロックで改行 + カラー
    const progress = p.progress
      ? `<div class="mt-1"><span class="badge text-bg-${progressClass(p.progress)}">${esc(p.progress)}</span></div>`
      : "";

    // summary は通常の本文（小さくしない）
    const summary = p.summary ? `<p class="mt-2 mb-0">${esc(p.summary)}</p>` : "";
    // goodFor を強調
    const goodFor = p.goodFor ? `<div class="mt-1 fw-semibold fs-6">${esc(p.goodFor)}</div>` : "";

    const sub = [p.magazines, p.cadenceAndPages].filter(Boolean).join("／");

    return `
    <div class="col-12 col-md-6">
      <div class="card mm-card h-100" data-id="${esc(p.id||"")}" data-title="${esc(p.title || p.projectName || "")}">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title mb-1">${esc(p.title || p.projectName || "(no title)")}</h5>
          <div class="text-muted small mb-1">${esc(p.projectName || "")}</div>
          ${progress}
          <div class="text-muted small mt-1">${esc(sub || "-")}</div>
          <div class="mt-2">${tags}</div>
          ${goodFor}
          ${summary}
          <div class="mt-3 d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm btn-select">選択</button>
            <a class="btn btn-outline-secondary btn-sm" href="#" role="button">気になる</a>
          </div>
          <div class="mt-auto text-muted small pt-2">最終更新：${fmt(p.updatedAt)}</div>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------
  // State & refs
  // ---------------------------
  let ALL = []; let view = [];
  let activeTag = ""; let page = 1; let pageSize = 6;
  const selected = new Set(); // id を保持

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

  // ---------------------------
  // Filtering / Sorting / Paging
  // ---------------------------
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

  // ---------------------------
  // Render
  // ---------------------------
  function render(){
    let slice = view;
    if (isFinite(pageSize)) {
      const start = (page-1)*pageSize;
      slice = view.slice(start, start + pageSize);
    }
    listEl.innerHTML = slice.map(cardHTML).join("");
    emptyEl.classList.toggle("d-none", view.length>0);

    renderPager();
    wireCardEvents();

    // Sticky bar
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

  // ---------------------------
  // Events
  // ---------------------------
  function wireFilters(){
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
  }

  function wireCardEvents(){
    // タグ絞り込み
    listEl.onclick = (e)=>{
      const tag = e.target.closest(".mm-chip");
      if (tag) {
        activeTag = tag.getAttribute("data-tag") || "";
        activeTagSpan.textContent = activeTag;
        activeTagBar.classList.remove("d-none");
        page = 1; applyFilters();
      }
    };

    // 選択トグル
    listEl.querySelectorAll(".btn-select").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const card = btn.closest(".mm-card");
        const id = card?.getAttribute("data-id") || "";
        if (!id) return;
        if (selected.has(id)) {
          selected.delete(id);
          btn.classList.remove("btn-primary");
          btn.classList.add("btn-outline-primary");
          btn.textContent = "選択";
        } else {
          selected.add(id);
          btn.classList.remove("btn-outline-primary");
          btn.classList.add("btn-primary");
          btn.textContent = "選択中";
        }
        selectedCount.textContent = String(selected.size);
        stickyBar.style.display = selected.size>0 ? "block" : "none";
      });
    });
  }

  // モーダル（選んでフカホリに伝える）
  function wireModal(){
    const openModalBtn = document.getElementById("openModalBtn");
    openModalBtn?.addEventListener("click", ()=>{
      const ul = document.getElementById("selectedList");
      if (ul) {
        const cards = Array.from(document.querySelectorAll(".mm-card"));
        const items = cards
          .filter(c => selected.has(c.getAttribute("data-id")||""))
          .map(c => ({ id: c.getAttribute("data-id"), title: c.getAttribute("data-title") }));
        ul.innerHTML = items.length
          ? items.map(i => `<li class="list-group-item d-flex justify-content-between align-items-center">
                              <span>${esc(i.title||i.id)}</span>
                              <code class="text-muted">${esc(i.id||"")}</code>
                            </li>`).join("")
          : `<div class="small text-muted p-2">選択されていません。</div>`;
      }
      const modalEl = document.getElementById("submitModal");
      if (modalEl && window.bootstrap) {
        const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        m.show();
      }
    });

    const submitForm = document.getElementById("submitForm");
    submitForm?.addEventListener("submit",(ev)=>{
      ev.preventDefault();
      // ここで送信先（例: 自前APIやDiscord Webhook）にPOSTする想定。
      // いまはダミーでコンソール出力のみ。
      const payload = Array.from(selected);
      console.log("send to Fukahori:", payload);
      const modalEl = document.getElementById("submitModal");
      if (modalEl && window.bootstrap) {
        const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        m.hide();
      }
    });
  }

  // ---------------------------
  // Init
  // ---------------------------
  (async function init(){
    const sess = await getSession();
    if (!sess.authenticated) { location.replace("/login"); return; }
    setUser(sess.user);
    bindLogout();

    try { ALL = await loadProjects(); } catch (e) { console.error(e); ALL = []; }

    wireFilters();
    wireModal();
    applyFilters();
  })();
})();
