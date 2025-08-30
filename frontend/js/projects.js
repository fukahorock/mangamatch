// frontend/js/projects.js
(() => {
  // ====== Auth & User UI ======
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
    const av = document.getElementById("userAvatar");
    if (av && u?.avatarUrl) { av.src = u.avatarUrl; av.alt = name; }
  }
  function bindLogout() {
    const go = () => { location.href = "/api/auth/logout"; };
    document.getElementById("logout")?.addEventListener("click", go);
    document.getElementById("logoutSide")?.addEventListener("click", go);
  }

  // ====== Data ======
  async function loadProjects() {
    const res = await fetch("/data/projects.json", { cache: "no-store" });
    if (!res.ok) throw new Error("projects.json load failed");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("projects.json must be an array");
    return data;
  }

  // ====== View helpers ======
  const esc = (s="") => String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmt = (iso)=>{ try{ return new Date(iso).toLocaleDateString(); }catch{ return iso||""; } };
  const clip = (s="", n=120)=> (s.length<=n ? s : s.slice(0,n-1)+"…");

  function progressClass(text="") {
    const t = String(text);
    if (/(連載|決定|採用|確定)/.test(t)) return "success";
    if (/(入賞|受賞|コンペ|選考|審査)/.test(t)) return "info";
    if (/(募集|一緒に|案内|募集中)/.test(t)) return "warning";
    if (/(注意|危険)/.test(t)) return "danger";
    if (/(終了|締切|停止|クローズ)/.test(t)) return "secondary";
    return "secondary";
  }

  function cardHTML(p){
    const tags = (p.tags||[]).map(t=>`<span class="badge rounded-pill text-bg-light me-1 mb-1 mm-chip" data-tag="${esc(t)}">${esc(t)}</span>`).join("");
    const progress = p.progress
      ? `<div class="mt-1"><span class="badge text-bg-${progressClass(p.progress)}">${esc(p.progress)}</span></div>`
      : "";
    const goodFor = p.goodFor ? `<div class="mt-2 fw-semibold fs-6">${esc(p.goodFor)}</div>` : "";
    const summary = p.summary ? `<p class="mt-2 mb-0">${esc(p.summary)}</p>` : "";
    const sub = [p.magazines, p.cadenceAndPages].filter(Boolean).join("／");

    return `
    <div class="col-12 col-md-6">
      <div class="card h-100 shadow-sm mm-card" data-id="${esc(p.id||"")}"
           data-title="${esc(p.title || p.projectName || "")}"
           data-summary="${esc(p.summary || "")}">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title mb-1">${esc(p.title || p.projectName || "(no title)")}</h5>
          <div class="text-muted small">${esc(p.projectName || "")}</div>
          ${progress}
          <div class="text-muted small mt-1">${esc(sub || "-")}</div>
          <div class="mt-2 d-flex flex-wrap">${tags}</div>
          ${goodFor}
          ${summary}
          <div class="mt-3">
            <button class="btn btn-outline-primary btn-sm btn-pick">気になる</button>
          </div>
          <div class="mt-auto text-muted small pt-2">最終更新：${fmt(p.updatedAt)}</div>
        </div>
      </div>
    </div>`;
  }

  // ====== State & refs ======
  let ALL = []; let view = [];
  let activeTag = ""; let page = 1; let pageSize = 6;
  const picked = new Map(); // id -> {id,title,summary}

  const $ = s => document.querySelector(s);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const pagerEl = $("#pager");
  const stickyBar = $("#stickyBar");
  const pickedCount = $("#count");
  const searchInput = $("#searchInput");
  const filterProgress = $("#filterProgress");
  const sortOrder = $("#sortOrder");
  const pageSizeSel = $("#pageSize");
  const clearFiltersBtn = $("#clearFilters");
  const activeTagBar = $("#activeTagBar");
  const activeTagSpan = $("#activeTag");
  const clearTagBtn = $("#clearTagBtn");

  // ====== Filter / Sort / Paging ======
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

  // ====== Render ======
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
    updateSticky();
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

  function wireCardEvents(){
    // タグ絞り込み
    listEl.onclick = (e)=>{
      const tag = e.target.closest(".mm-chip");
      if (tag) {
        activeTag = tag.getAttribute("data-tag") || "";
        activeTagSpan.textContent = activeTag;
        activeTagBar.classList.remove("d-none");
        page = 1; applyFilters();
        return;
      }
    };

    // 「気になる」トグル
    listEl.querySelectorAll(".btn-pick").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const card = btn.closest(".mm-card");
        const id = card?.dataset.id || "";
        if (!id) return;
        const data = { id, title: card?.dataset.title || "", summary: card?.dataset.summary || "" };

        if (picked.has(id)) {
          picked.delete(id);
          btn.classList.remove("btn-primary");
          btn.classList.add("btn-outline-primary");
          btn.textContent = "気になる";
        } else {
          picked.set(id, data);
          btn.classList.remove("btn-outline-primary");
          btn.classList.add("btn-primary");
          btn.textContent = "選択中";
        }
        updateSticky();
      });
    });
  }

  function updateSticky(){
    pickedCount.textContent = String(picked.size);
    stickyBar.style.display = picked.size>0 ? "block" : "none";
  }

  // ====== Filters ======
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

  // ====== Modal / Submit ======
  function wireModal(){
    const openModalBtn = document.getElementById("openModalBtn");
    const selectedList = document.getElementById("selectedList");
    const messageInput = document.getElementById("messageInput");
    const submitForm = document.getElementById("submitForm");

    openModalBtn?.addEventListener("click", ()=>{
      const items = Array.from(picked.values());
      selectedList.innerHTML = items.length
        ? items.map(i => `<li class="list-group-item">
            <div class="fw-semibold">${esc(i.title||i.id)}</div>
            <div class="text-muted small">${esc(clip(i.summary||"", 120))}</div>
          </li>`).join("")
        : `<div class="small text-muted p-2">選択されていません。</div>`;

      const modalEl = document.getElementById("submitModal");
      if (modalEl && window.bootstrap) {
        const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        m.show();
      }
    });

    submitForm?.addEventListener("submit", async (ev)=>{
      ev.preventDefault();
      const btn = submitForm.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>送信中…`;
      try {
        const payload = {
          picks: Array.from(picked.values()).map(x => ({ id:x.id, title:x.title, summary: clip(x.summary, 160) })),
          message: messageInput?.value || ""
        };
        const r = await fetch("/api/auth/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error("submit failed");
        // 送信成功 → モーダルを閉じて選択解除
        picked.clear(); updateSticky();
        const modalEl = document.getElementById("submitModal");
        if (modalEl && window.bootstrap) {
          (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)).hide();
        }
        messageInput.value = "";
      } catch (e) {
        alert("送信に失敗しました。時間をおいて再試行してください。");
        console.error(e);
      } finally {
        btn.disabled = false;
        btn.textContent = "送信する";
      }
    });
  }

  // ====== Init ======
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
