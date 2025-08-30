(async function () {
  const $ = (s)=>document.querySelector(s);
  const listEl = $("#list");
  const emptyEl = $("#empty");
  const stickyBar = $("#stickyBar");
  const countEl = $("#count");
  const activeTagBar = $("#activeTagBar");
  const activeTagEl = $("#activeTag");

  // デモ用：Discord名のプレースホルダ（将来OAuthで差し替え）
  const demoName = "（テストユーザー）";
  ["#userName", "#userNameSide", "#userNameOff"].forEach(sel=>{
    const el = document.querySelector(sel); if(el) el.textContent = demoName;
  });

  // データ読み込み
  const res = await fetch("projects.json", { cache: "no-store" });
  const projects = await res.json();

  // 状態
  const selected = new Map(); // id -> project
  let tagFilter = "";         // クリック中のタグ
  let progressFilter = "";    // 進捗
  let keyword = "";           // 検索

  const progressColor = (p)=>({
    "連載決定済み":"success",
    "コンペ用ネーム準備中":"primary",
    "一緒につくろう企画段階":"warning",
    "アイデアだけある":"secondary"
  }[p] || "secondary");

  function matches(p){
    // 進捗
    if(progressFilter && p.progress !== progressFilter) return false;
    // タグ
    if(tagFilter && !(p.tags||[]).includes(tagFilter)) return false;
    // キーワード
    if(keyword){
      const blob = [
        p.projectName, p.progress, p.title,
        (p.tags||[]).join(" "), p.magazines, p.cadenceAndPages,
        p.goodFor, p.summary, p.notes
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
      col.className = "col-12 col-md-6 col-lg-4";
      const tagsHtml = (p.tags||[]).map(t=>`<span class="mm-chip js-tag" data-tag="${t}">${t}</span>`).join("");

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

            <div class="row g-2 mt-2">
              <div class="col-12">
                <div class="mm-label mb-1">想定雑誌（自由記入）</div>
                <div>${p.magazines || "—"}</div>
              </div>
              <div class="col-12">
                <div class="mm-label mb-1">想定頻度とページ数（自由記入）</div>
                <div>${p.cadenceAndPages || "—"}</div>
              </div>
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

            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-outline-primary btn-sm flex-grow-1 js-like" data-id="${p.id}">気になる</button>
              <div class="form-check ms-auto">
                <input class="form-check-input js-check" type="checkbox" value="${p.id}" id="chk_${p.id}">
                <label class="form-check-label small" for="chk_${p.id}">選択</label>
              </div>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(col);

      // タグクリック → フィルタ
      col.querySelectorAll(".js-tag").forEach(el=>{
        el.addEventListener("click", ()=>{
          tagFilter = el.dataset.tag;
          activeTagEl.textContent = `# ${tagFilter}`;
          activeTagBar.classList.remove("d-none");
          render();
          window.scrollTo({top:0,behavior:"smooth"});
        });
      });

      // 気になる（単体）→ いまはデザイン用
      col.querySelector(".js-like").addEventListener("click", ()=>{
        console.log("気になる（単体）:", p.id, p.title);
        alert(`「${p.title}」を気になるにしました（デザイン版：console出力のみ）`);
      });

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
    tagFilter=""; progressFilter=""; keyword="";
    $("#searchInput").value=""; $("#filterProgress").value="";
    activeTagBar.classList.add("d-none");
    render();
  });

  // 送信モーダル（デザインのみ）
  const modal = new bootstrap.Modal(document.getElementById("submitModal"));
  $("#openModalBtn").addEventListener("click", ()=>{
    const ul = $("#selectedList"); ul.innerHTML="";
    [...selected.values()].forEach(p=>{
      const li=document.createElement("li"); li.textContent = `${p.title}（${p.progress}）`; ul.appendChild(li);
    });
    modal.show();
  });
  $("#submitForm").addEventListener("submit",(e)=>{
    e.preventDefault();
    const note = $("#noteCommon").value.trim();
    console.log("フカホリ宛（まとめて）:", { ids:[...selected.keys()], note });
    alert(`${selected.size}件をフカホリに伝えました（デザイン版：console出力のみ）`);
    modal.hide();
  });

  // 初期表示
  render();
})();
