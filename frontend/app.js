(async function () {
  const $ = (s)=>document.querySelector(s);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const stickyBar = $("#stickyBar");
  const countEl = $("#count");

  // デモ用ログイン表示
  const demoName = "（テストユーザー）";
  ["#userName", "#userNameSide", "#userNameOff"].forEach(sel=>{
    const el = document.querySelector(sel); if(el) el.textContent = demoName;
  });

  // データ読み込み
  const res = await fetch("projects.json", { cache: "no-store" });
  let projects = await res.json();

  // 更新日ソート（新しい順）
  projects.sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt));

  const selected = new Map();
  let progressFilter = "";
  let keyword = "";

  const progressColor = (p)=>({
    "連載決定済み":"success",
    "コンペ用ネーム準備中":"primary",
    "一緒につくろう企画段階":"warning",
    "アイデアだけある":"secondary"
  }[p] || "secondary");

  function formatDate(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
  }

  function matches(p){
    if(progressFilter && p.progress !== progressFilter) return false;
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

  function render(){
    const items = projects.filter(matches);
    listEl.innerHTML = "";
    if(!items.length){ emptyEl.classList.remove("d-none"); }
    else { emptyEl.classList.add("d-none"); }

    items.forEach(p=>{
      const col = document.createElement("div");
      // 基本2列
      col.className = "col-12 col-md-6 col-lg-6";
      const tagsHtml = (p.tags||[]).map(t=>`<span class="mm-chip">${t}</span>`).join("");

      col.innerHTML = `
        <div class="card mm-card h-100">
          <div class="card-body d-flex flex-column">
            <div class="d-flex align-items-start justify-content-between">
              <div class="fw-semibold">${p.projectName}</div>
              <span class="badge text-bg-${progressColor(p.progress)}">${p.progress}</span>
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

            <div class="mt-3 d-flex justify-content-end">
              <div class="form-check">
                <input class="form-check-input js-check" type="checkbox" value="${p.id}" id="chk_${p.id}">
                <label class="form-check-label small" for="chk_${p.id}">選択</label>
              </div>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(col);

      // 複数選択
      const chk = col.querySelector(".js-check");
      chk.checked = selected.has(p.id);
      chk.addEventListener("change",(e)=>{
        if(e.target.checked) selected.set(p.id,p); else selected.delete(p.id);
        updateBar();
      });
    });
  }

  function updateBar(){
    const n = selected.size;
    countEl.textContent = n;
    stickyBar.style.display = n ? "block" : "none";
  }

  // 検索・進捗
  $("#searchInput").addEventListener("input",(e)=>{ keyword = e.target.value.trim().toLowerCase(); render(); });
  $("#filterProgress").addEventListener("change",(e)=>{ progressFilter = e.target.value; render(); });
  $("#clearFilters").addEventListener("click", ()=>{
    progressFilter=""; keyword="";
    $("#searchInput").value=""; $("#filterProgress").value="";
    render();
  });

// 送信モーダル（デザインのみ）
const modal = new bootstrap.Modal(document.getElementById("submitModal"));

document.getElementById("openModalBtn").addEventListener("click", ()=>{
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
  alert(`${selected.size}件をフカホリに伝えました（デザイン版：console出力のみ）`);
  modal.hide();
});


  // 初期表示
  render();
})();
