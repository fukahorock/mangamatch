(async function () {
  const $ = (s)=>document.querySelector(s);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const stickyBar = $("#stickyBar");
  const countEl = $("#count");
  const pagerEl = $("#pager");
  const activeTagBar = $("#activeTagBar");
  const activeTagEl  = $("#activeTag");

  // ログイン表示（デモ）
  const demoName = "（テストユーザー）";
  ["#userName", "#userNameSide", "#userNameOff"].forEach(sel=>{
    const el = document.querySelector(sel); if(el) el.textContent = demoName;
  });

  // データ読み込み
  const res = await fetch("projects.json", { cache: "no-store" });
  let projects = await res.json();

  // 状態
  const selected = new Map();      // id -> project
  let progressFilter = "";         // 進捗
  let keyword = "";                // フリーワード
  let tagFilter = "";              // タグ
  let sortOrder = "desc";          // "desc" | "asc"
  let perPage = 6;                 // 6 | 12 | 24 | Infinity
  let currentPage = 1;

  const progressColor = (p)=>({
    "連載決定済み":"success",
    "コンペ用ネーム準備中":"primary",
    "一緒につくろう企画段階":"warning",
    "アイデアだけある":"secondary",
    "募集終了":"secondary"
  }[p] || "secondary");

  function formatDate(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
  }

  function sortByUpdated(items){
    return items.slice().sort((a,b)=>{
      const da = new Date(a.updatedAt).getTime();
      const db = new Date(b.updatedAt).getTime();
      return sortOrder === "desc" ? (db - da) : (da - db);
    });
  }

  function matches(p){
    if(progressFilter && p.progress !== progressFilter) return false;
    if(tagFilter && !(p.tags||[]).includes(tagFilter)) return false;
    if(keyword){
      const blob = [
        p.projectName, p.progress, p.title,
        (p.tags||[]).join(" "), p.magazines, p.cadenceAndPages,
        p.goodFor, p.summary, p.notes, p.updatedAt
      ].join(" ").toLowerCase();
      if(!blob.includes(keyword)) return false;
    }
    return true;
  }

  function filteredItems(){
    const filtered = projects.filter(matches);
    return sortByUpdated(filtered);
  }

  function pagedItems(items){
    if(!Number.isFinite(perPage)) return items;
    const start = (currentPage-1)*perPage;
    return items.slice(start, start + perPage);
  }

  function renderPager(total){
    pagerEl.innerHTML = "";
    if(!Number.isFinite(perPage)) return; // 全件表示のときは非表示

    const totalPages = Math.max(1, Math.ceil(total/perPage));
    currentPage = Math.min(currentPage, totalPages);

    const mkItem = (label, page, disabled=false, active=false)=>{
      const li = document.createElement("li");
      li.className = `page-item ${disabled?'disabled':''} ${active?'active':''}`;
      const a = document.createElement("a");
      a.className = "page-link";
      a.href = "#";
      a.textContent = label;
      a.addEventListener("click",(e)=>{
        e.preventDefault();
        if(disabled || page===currentPage) return;
        currentPage = page;
        render();
        window.scrollTo({top:0, behavior:"smooth"});
      });
      li.appendChild(a);
      return li;
    };

    pagerEl.appendChild(mkItem("«", Math.max(1, currentPage-1), currentPage===1));
    for(let p=1;p<=totalPages;p++){
      pagerEl.appendChild(mkItem(String(p), p, false, p===currentPage));
    }
    pagerEl.appendChild(mkItem("»", Math.min(totalPages, currentPage+1), currentPage===totalPages));
  }

  function render(){
    const itemsAll = filteredItems();
    const items = pagedItems(itemsAll);

    // リスト描画
    listEl.innerHTML = "";
    if(!items.length){ emptyEl.classList.remove("d-none"); }
    else { emptyEl.classList.add("d-none"); }

    items.forEach(p=>{
      const col = document.createElement("div");
      col.className = "col-12 col-md-6 col-lg-6"; // 基本2列

      const tagsHtml = (p.tags||[]).map(t=>`<span class="mm-chip js-tag" data-tag="${t}">${t}</span>`).join("");
      const isClosed = (p.progress === "募集終了");
      const badgeClass = isClosed ? "badge-closed" : `text-bg-${progressColor(p.progress)}`;
      const isSelected = selected.has(p.id);
      const btnClass = isSelected ? "btn btn-primary" : "btn btn-outline-primary";
      const btnLabel = isSelected ? "✓ 選択中" : "気になる";
      const disabledAttr = isClosed ? "disabled" : "";

      col.innerHTML = `
        <div class="card mm-card h-100">
          <div class="card-body d-flex flex-column">
            <div class="d-flex align-items-start justify-content-between">
              <div class="fw-semibold">${p.projectName}</div>
              <span class="badge ${badgeClass}">${p.progress}</span>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">作品タイトル</div>
              <div class="fw-semibold">${p.title || "（未定）"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">作品タグ</div>
              <div>${tagsHtml}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">想定雑誌</div>
              <div>${p.magazines || "—"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">想定頻度とページ数</div>
              <div>${p.cadenceAndPages || "—"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">向いてそうな人</div>
              <div>${p.goodFor || "—"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">内容</div>
              <div class="mm-note">${p.summary || "—"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">備考</div>
              <div class="mm-note">${p.notes || "—"}</div>
            </div>

            <div class="mt-2">
              <div class="mm-label mb-1">更新日</div>
              <div class="small text-muted">📅 ${formatDate(p.updatedAt)}</div>
            </div>

            <div class="mt-3 d-flex justify-content-between align-items-center">
              <button class="${btnClass} js-select" data-id="${p.id}" ${disabledAttr}>${btnLabel}</button>
              ${isClosed ? '<span class="small text-muted ms-2">募集終了のため選択不可</span>' : ''}
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(col);

      // タグクリック → 絞り込み
      col.querySelectorAll(".js-tag").forEach(el=>{
        el.addEventListener("click", ()=>{
          tagFilter = el.dataset.tag;
          activeTagEl.textContent = `# ${tagFilter}`;
          activeTagBar.classList.remove("d-none");
          currentPage = 1;
          render();
          window.scrollTo({top:0,behavior:"smooth"});
        });
      });

      // 選択トグル
      const btn = col.querySelector(".js-select");
      if(btn){
        btn.addEventListener("click", ()=>{
          if(selected.has(p.id)) selected.delete(p.id);
          else selected.set(p.id, p);
          updateBar();
          render(); // 見た目更新
        });
      }
    });

    // ページャ
    renderPager(itemsAll.length);
  }

  function updateBar(){
    const n = selected.size;
    countEl.textContent = n;
    stickyBar.style.display = n ? "block" : "none";
  }

  // 入力系イベント
  $("#searchInput").addEventListener("input",(e)=>{ keyword = e.target.value.trim().toLowerCase(); currentPage=1; render(); });
  $("#filterProgress").addEventListener("change",(e)=>{ progressFilter = e.target.value; currentPage=1; render(); });
  $("#sortOrder").addEventListener("change",(e)=>{ sortOrder = e.target.value; currentPage=1; render(); });
  $("#pageSize").addEventListener("change",(e)=>{
    const v = e.target.value;
    perPage = (v === "all") ? Infinity : parseInt(v,10);
    currentPage = 1;
    render();
  });
  $("#clearFilters").addEventListener("click", ()=>{
    progressFilter=""; keyword=""; tagFilter="";
    $("#searchInput").value=""; $("#filterProgress").value="";
    activeTagBar.classList.add("d-none");
    currentPage=1; render();
  });
  $("#clearTagBtn").addEventListener("click", ()=>{ tagFilter=""; activeTagBar.classList.add("d-none"); currentPage=1; render(); });

  // モーダル（まとめて送信／デザインのみ）
  const modal = new bootstrap.Modal(document.getElementById("submitModal"));
  $("#openModalBtn").addEventListener("click", ()=>{
    const wrap = document.getElementById("selectedList");
    wrap.innerHTML = "";
    [...selected.values()].forEach(p=>{
      const row = document.createElement("div");
      row.className = "border rounded p-2";
      row.innerHTML = `
        <div class="fw-semibold mb-1">${p.title || "（未定）"} <span class="text-muted small">（${p.progress}）</span></div>
        <input type="text" class="form-control form-control-sm js-item-note"
               data-id="${p.id}" maxlength="120"
               placeholder="この作品への一言（任意・120文字まで）">
      `;
      wrap.appendChild(row);
    });
    modal.show();
  });

  document.getElementById("submitForm").addEventListener("submit",(e)=>{
    e.preventDefault();
    const noteCommon = document.getElementById("noteCommon").value.trim();
    const notesByProject = {};
    document.querySelectorAll(".js-item-note").forEach(inp=>{
      const v = inp.value.trim();
      if(v) notesByProject[inp.dataset.id] = v;
    });
    console.log("フカホリ宛（まとめて）:", {
      ids: [...selected.keys()],
      noteCommon,
      notesByProject
    });
    alert(`${Object.keys(notesByProject).length ? "各作品の一言付きで" : ""}${selected.size}件をフカホリに伝えました（デザイン版）`);
    modal.hide();
  });

  // 初期表示（更新日：新しい順／6件表示）
  render();
})();

/* ===========================
   mangamatch notify glue (append-only)
   - 既存の app.js を変更せず、末尾に貼るだけで通知を追加
   =========================== */

// 1) /api/notify 呼び出し（index.html 側に無ければ定義）
if (typeof window.mmPostNotify !== "function") {
  window.mmPostNotify = async function(type, data) {
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, data })
      });
    } catch (e) {
      console.warn("notify failed:", e);
    }
  };
}

// 2) 「気になる」ボタンの通知フック（イベント委譲）
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest('[data-action="favorite"], .js-favorite, .favorite-btn');
  if (!btn) return;

  const card = btn.closest("[data-project-id], .card, [data-id]");
  const projectId =
    btn.getAttribute("data-id") ||
    (card && (card.getAttribute("data-project-id") || card.getAttribute("data-id"))) ||
    undefined;

  let title =
    btn.getAttribute("data-title") ||
    (card && (card.querySelector(".card-title, [data-title]")?.textContent?.trim() ||
              card.getAttribute("data-title"))) ||
    "";

  const selected =
    btn.classList.contains("selected") ||
    btn.classList.contains("active") ||
    (card && (card.classList.contains("selected") || card.classList.contains("is-selected"))) ||
    btn.getAttribute("aria-pressed") === "true" ||
    btn.getAttribute("data-selected") === "true";

  window.mmPostNotify("favorite", { projectId, title, selected });
}, false);

// 3) 「まとめて送信」通知フック
async function mmCollectSelectedProjectIds() {
  const out = new Set();
  document.querySelectorAll("[data-project-id][data-selected='true']").forEach(el => out.add(el.getAttribute("data-project-id")));
  document.querySelectorAll(".card.selected, [data-project-id].selected").forEach(el => out.add(el.getAttribute("data-project-id")));
  document.querySelectorAll('input[name="projectIds[]"]:checked, input[data-project-id][type="checkbox"]:checked')
    .forEach(el => out.add(el.value || el.getAttribute("data-project-id")));
  return Array.from(out);
}

document.addEventListener("click", async (ev) => {
  const submitBtn = ev.target.closest('#submitSelected, .js-submit, [data-action="submit"]');
  if (!submitBtn) return;

  const noteCommon = (document.querySelector("#noteCommon, textarea[name='noteCommon']")?.value || "").trim();
  const perProjectComments = {};
  document.querySelectorAll("textarea[data-project-id], input[type='text'][data-project-id]").forEach(el => {
    const pid = el.getAttribute("data-project-id");
    if (!pid) return;
    const v = (el.value || "").trim();
    if (v) perProjectComments[pid] = v;
  });

  const selectedIds = await mmCollectSelectedProjectIds();
  window.mmPostNotify("submit", { selectedIds, message: noteCommon, comments: perProjectComments });
}, false);

// 4) （任意）ログイン通知：1セッション1回だけ
(async () => {
  try {
    const flagKey = "mm_login_notified";
    if (sessionStorage.getItem(flagKey) === "1") return;

    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.authenticated) {
      sessionStorage.setItem(flagKey, "1");
      window.mmPostNotify("login", { user: j.user });
    }
  } catch {}
})();
