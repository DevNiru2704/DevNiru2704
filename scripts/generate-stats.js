#!/usr/bin/env node
// Renders pixel-art GitHub stat cards (stats, languages, streak) as dark/light SVGs.
// Usage: GH_TOKEN=... node scripts/generate-stats.js [outDir]   |   node scripts/generate-stats.js [outDir] --mock
const fs = require("fs");
const path = require("path");

const USER = process.env.GITHUB_REPOSITORY_OWNER || "DevNiru2704";
const MOCK = process.argv.includes("--mock");
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--")) || "dist";
const FONT = "ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace";

// ---------- data ----------
async function gql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub API error: ${res.status} ${JSON.stringify(json.errors || json.message)}`);
  return json.data;
}

function streaks(days) {
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const list = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count }));
  let longest = { len: 0 }, run = null;
  for (const d of list) {
    if (d.count > 0) {
      run = run ? { ...run, len: run.len + 1, end: d.date } : { len: 1, start: d.date, end: d.date };
      if (run.len > longest.len) longest = run;
    } else run = null;
  }
  let i = list.length - 1;
  if (i >= 0 && list[i].count === 0) i--; // today may not have a contribution yet
  let current = { len: 0 };
  for (; i >= 0 && list[i].count > 0; i--) current = { len: current.len + 1, start: list[i].date, end: current.end || list[i].date };
  return { current, longest, total: list.reduce((s, d) => s + d.count, 0) };
}

async function fetchData() {
  // shortcut: first 100 owned repos only, upgrade to pagination past 100 repos
  const u = (await gql(`query{user(login:"${USER}"){createdAt followers{totalCount} pullRequests{totalCount} issues{totalCount}
    repositories(first:100,ownerAffiliations:OWNER,isFork:false){totalCount nodes{stargazerCount languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}}}}`)).user;
  const y0 = new Date(u.createdAt).getUTCFullYear(), y1 = new Date().getUTCFullYear();
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let q = "";
  for (let y = y0; y <= y1; y++) {
    q += `y${y}:contributionsCollection(from:"${y}-01-01T00:00:00Z",to:"${y === y1 ? now : y + "-12-31T23:59:59Z"}"){totalCommitContributions restrictedContributionsCount contributionCalendar{weeks{contributionDays{date contributionCount}}}}`;
  }
  const c = (await gql(`query{user(login:"${USER}"){${q}}}`)).user;
  let commits = 0;
  const days = [];
  for (const k of Object.keys(c)) {
    commits += c[k].totalCommitContributions + c[k].restrictedContributionsCount;
    for (const w of c[k].contributionCalendar.weeks) for (const d of w.contributionDays) days.push({ date: d.date, count: d.contributionCount });
  }
  const langs = new Map();
  let stars = 0;
  for (const r of u.repositories.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      const cur = langs.get(e.node.name) || { name: e.node.name, color: e.node.color, size: 0 };
      cur.size += e.size;
      langs.set(e.node.name, cur);
    }
  }
  return {
    stars, commits, prs: u.pullRequests.totalCount, issues: u.issues.totalCount, repos: u.repositories.totalCount,
    followers: u.followers.totalCount, langs: [...langs.values()].sort((a, b) => b.size - a.size), streak: streaks(days),
  };
}

const MOCK_DATA = {
  stars: 42, commits: 1234, prs: 87, issues: 12, repos: 28, followers: 15,
  langs: [["TypeScript", "#3178c6", 500], ["Python", "#3572A5", 300], ["JavaScript", "#f1e05a", 150], ["Java", "#b07219", 80], ["C++", "#f34b7d", 60], ["CSS", "#563d7c", 30]]
    .map(([name, color, size]) => ({ name, color, size })),
  streak: { current: { len: 12, start: "2026-11-08", end: "2026-11-19" }, longest: { len: 45, start: "2026-02-01", end: "2026-03-17" }, total: 1876 },
};

// ---------- drawing ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => Number(n).toLocaleString("en-US");
const date = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function sprite(rows, x, y, s, pal) {
  let out = "";
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; ) {
      const ch = row[i];
      if (ch === ".") { i++; continue; }
      let k = i;
      while (k < row.length && row[k] === ch) k++;
      out += `<rect x="${x + i * s}" y="${y + j * s}" width="${(k - i) * s}" height="${s}" fill="${pal[ch]}"/>`;
      i = k;
    }
  });
  return out;
}

function box(x, y, w, h, fill, border, s = 6) {
  return `<rect x="${x + s}" y="${y}" width="${w - 2 * s}" height="${h}" fill="${border}"/><rect x="${x}" y="${y + s}" width="${w}" height="${h - 2 * s}" fill="${border}"/>` +
    `<rect x="${x + s}" y="${y + s}" width="${w - 2 * s}" height="${h - 2 * s}" fill="${fill}"/><rect x="${x + 2 * s}" y="${y + s}" width="${w - 4 * s}" height="${h - 2 * s}" fill="${fill}"/>` +
    `<rect x="${x + s}" y="${y + 2 * s}" width="${w - 2 * s}" height="${h - 4 * s}" fill="${fill}"/>`;
}

const THEMES = {
  dark: { panel: "#232347", border: "#F2C14E", ink: "#F1E0B0", mute: "#A9AECF", accent: "#F2C14E", track: "#3A3A63", outline: "#7A7AA8" },
  light: { panel: "#F6EBCB", border: "#B07A2A", ink: "#2A1F3D", mute: "#5B5470", accent: "#8A2D1F", track: "#D9C79B", outline: "#2A1F3D" },
};
const ICON = {
  star: ["...Y...", "..YYY..", "YYYYYYY", ".YYYYY.", ".YY.YY.", "YY...YY", "......."],
  sword: ["...W...", "...W...", "...W...", "...W...", "..GGG..", "...B...", "...B..."],
  shield: ["KKKKKKK", "KRRGRRK", "KRGGGRK", "KRRGRRK", ".KRRRK.", "..KRK..", "...K..."],
  scroll: ["..KKKK.", ".KPPPPK", ".KP..PK", ".KPPPPK", ".KP..PK", ".KPPPPK", "..KKKK."],
  castle: ["T.T.T.T", "TTTTTTT", "TTTKTTT", "TTKKKTT", "TTKKKTT", "TTKKKTT", "TTTTTTT"],
  heart: [".RR.RR.", "RRRRRRR", "RRRRRRR", ".RRRRR.", "..RRR..", "...R...", "......."],
  flame: ["...F...", "..FFF..", ".FFQFF.", ".FQQQF.", "FFQYQFF", "FQYYYQF", ".FQYQF."],
  flame2: ["..F....", "..FF...", ".FFQF..", ".FQQQF.", "FFQYQFF", "FQYYYQF", ".FQYQF."],
};
const iconPal = (t) => ({ Y: "#F2C14E", W: "#9AA5B1", G: "#F2C14E", B: "#8A5A2B", R: "#C0392B", P: "#E8D5A8", T: "#8F93B5", K: t.outline, F: "#E04B2A", Q: "#F29B2A" });

function svg(w, h, label, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>` +
    `<style>.t{font-family:${FONT};font-weight:700}.fa{animation:fa 1s steps(1) infinite}.fb{animation:fb 1s steps(1) infinite}@keyframes fa{0%{opacity:1}50%{opacity:0}}@keyframes fb{0%{opacity:0}50%{opacity:1}}@media (prefers-reduced-motion:reduce){*{animation:none!important}.fb{opacity:0}}</style>${body}</svg>`;
}

function statsCard(d, t) {
  const rows = [["star", "Stars earned", d.stars], ["sword", "Commits", d.commits], ["shield", "Pull requests", d.prs],
    ["scroll", "Issues", d.issues], ["castle", "Repositories", d.repos], ["heart", "Followers", d.followers]];
  let o = box(0, 0, 440, 292, t.panel, t.border);
  o += `<text x="30" y="46" class="t" font-size="20" fill="${t.accent}">HERO STATS</text><text x="30" y="68" class="t" font-size="13" fill="${t.mute}">@${esc(USER)}</text>`;
  rows.forEach(([ic, label, v], i) => {
    const y = 90 + i * 32;
    o += sprite(ICON[ic], 30, y, 3, iconPal(t)) + `<text x="66" y="${y + 17}" class="t" font-size="15" fill="${t.ink}">${label}</text>` +
      `<text x="410" y="${y + 17}" text-anchor="end" class="t" font-size="16" fill="${t.accent}">${fmt(v)}</text>`;
  });
  return svg(440, 292, `GitHub stats for ${USER}`, o);
}

function langsCard(d, t) {
  const top = d.langs.slice(0, 6), total = d.langs.reduce((s, l) => s + l.size, 0) || 1;
  let o = box(0, 0, 440, 292, t.panel, t.border);
  o += `<text x="30" y="46" class="t" font-size="20" fill="${t.accent}">SPELLBOOK</text><text x="30" y="68" class="t" font-size="13" fill="${t.mute}">most cast languages</text>`;
  top.forEach((l, i) => {
    const y = 92 + i * 31, pct = (l.size / total) * 100, on = Math.max(1, Math.round(pct / 10));
    o += `<text x="30" y="${y + 14}" class="t" font-size="14" fill="${t.ink}">${esc(l.name.slice(0, 11))}</text>`;
    for (let k = 0; k < 10; k++) o += `<rect x="${150 + k * 19}" y="${y}" width="16" height="18" fill="${k < on ? l.color || "#7FD0A0" : t.track}"/>`;
    o += `<text x="410" y="${y + 14}" text-anchor="end" class="t" font-size="14" fill="${t.accent}">${pct.toFixed(1)}%</text>`;
  });
  return svg(440, 292, `Top languages for ${USER}`, o);
}

function streakCard(d, t) {
  const s = d.streak, range = (r) => (r.len ? `${date(r.start)} - ${date(r.end)}` : "no active streak");
  let o = box(0, 0, 900, 170, t.panel, t.border);
  o += `<rect x="300" y="26" width="4" height="118" fill="${t.track}"/><rect x="596" y="26" width="4" height="118" fill="${t.track}"/>`;
  const col = (cx, big, label, sub) =>
    `<text x="${cx}" y="92" text-anchor="middle" class="t" font-size="44" fill="${t.accent}">${big}</text><text x="${cx}" y="120" text-anchor="middle" class="t" font-size="14" fill="${t.ink}">${label}</text>` +
    `<text x="${cx}" y="142" text-anchor="middle" class="t" font-size="12" fill="${t.mute}">${sub}</text>`;
  o += col(150, fmt(d.streak.total), "TOTAL CONTRIBUTIONS", "all time");
  o += col(450, `${s.current.len}`, "CURRENT STREAK", range(s.current));
  o += col(750, `${s.longest.len}`, "LONGEST STREAK", range(s.longest));
  const pal = iconPal(t);
  o += `<g class="fa">${sprite(ICON.flame, 436, 22, 4, pal)}</g><g class="fb">${sprite(ICON.flame2, 436, 22, 4, pal)}</g>`;
  return svg(900, 170, `Contribution streak for ${USER}`, o);
}

// ---------- main ----------
(async () => {
  const data = MOCK ? MOCK_DATA : await fetchData();
  const files = {};
  for (const [name, t] of Object.entries(THEMES)) {
    files[`stats-${name}.svg`] = statsCard(data, t);
    files[`langs-${name}.svg`] = langsCard(data, t);
    files[`streak-${name}.svg`] = streakCard(data, t);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, content] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), content);
  console.log(`wrote ${Object.keys(files).length} cards to ${OUT}${MOCK ? " (mock data)" : ""}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
