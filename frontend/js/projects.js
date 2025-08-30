// projects.js — /data/projects.json をそのまま読む版
// 期待スキーマ: { id, projectName, progress, title, tags[], magazines, cadenceAndPages, goodFor, summary, notes, updatedAt }

async function loadProjects(url = "/data/projects.json") {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("projects.json must be an array");
  return data;
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch { return iso || ""; } }

function progressBadge(text = "") {
  // progress をそのままバッジ表示（色分けしたい場合は後でCSS側で[data-progress]に応じて装飾）
  return `<span class="badge" data-progress="${esc(text)}">${esc(text)}</span>`;
}

function renderCard(p) {
  // 検索用のデータ属性（まとめてぶち込む）
  const searchBlob = [
    p.title, p.projectName, p.progress, p.magazines, p.cadenceAndPages, p.goodFor, p.summary, p.notes,
    ...(Array.isArray(p.tags) ? p.tags : [])
  ].filter(Boolean).join(" ").toLowerCase();

  const tagsHtml = (p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");

  return `
  <article class="card"
    data-search="${esc(searchBlob)}"
    data-name="${esc((p.title || p.projectName || "").toLowerCase())}"
    data-updated="${esc(p.updatedAt || "")}">
    <div class="row">
      <h3>${esc(p.title || p.projectName || "(no title)")}</h3>
      ${progressBadge(p.progress)}
    </div>
    <div class="muted" style="margin:.15rem 0 .35rem">${esc(p.projectName || "")}</div>

    <div class="tags">${tagsHtml}</div>

    <div class="meta">掲載候補: ${esc(p.magazines || "-")} / ペース: ${esc(p.cadenceAndPages || "-")}</div>
    <div class="meta">向いてる人: ${esc(p.goodFor || "-")}</div>

    ${p.summary ? `<p class="meta" style="margin-top:.35rem">${esc(p.summary)}</p>` : ""}
    ${p.notes ? `<p class="meta" style="color:#999">${esc(p.notes)}</p>` : ""}

    <div class="meta" style="margin-top:.35rem">最終更新: ${fmtDate(p.updatedAt)}</div>
  </article>`;
}

function applyFilterAndSort({ qVal, sortVal, all }) {
  const kw = (qVal || "").trim().toLowerCase();
  const cards = Array.from(all.children);

  // filter（検索は data-search に対して実施）
  for (const el of cards) {
    const hit = !kw || el.dataset.search.includes(kw);
    el.style.display = hit ? "" : "none";
  }

  // sort
  const visible = cards.filter(c => c.style.display !== "none");
  const cmp = {
    "updated_desc": (a, b) => b.dataset.updated.localeCompare(a.dataset.updated),
    "updated_asc":  (a, b) => a.dataset.updated.localeCompare(b.dataset.updated),
    "name_asc":     (a, b) => a.dataset.name.localeCompare(b.dataset.name),
    "name_desc":    (a, b) => b.dataset.name.localeCompare(a.dataset.name),
  }[sortVal || "updated_desc"];
  visible.sort(cmp).forEach(el => all.appendChild(el));
}

export async function initProjects({ input, sort, grid, empty, dataUrl = "/data/projects.json" }) {
  try {
    const projects = await loadProjects(dataUrl);

    // 描画
    grid.innerHTML = projects.map(renderCard).join("");
    empty.hidden = projects.length > 0;

    // イベント
    const sync = () => applyFilterAndSort({ qVal: input.value, sortVal: sort.value, all: grid });
    input?.addEventListener("input", sync);
    sort?.addEventListener("change", sync);
    sync();
  } catch (e) {
    console.error(e);
    empty.hidden = false;
    empty.textContent = "プロジェクトデータの読み込みに失敗しました。";
  }
}
