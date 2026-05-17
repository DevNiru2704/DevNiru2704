const fs = require("fs");

const username = "DevNiru2704";

const featuredRepos = [
  "CONTEXT",
  "doklink-development",
  "auktave",
  "a_fashions",
  "portfolio-2.0",
];

const colors = {
  TypeScript: "3178C6",
  JavaScript: "F7DF1E",
  Python: "3776AB",
  React: "61DAFB",
  Django: "092E20",
  Docker: "2496ED",
  PostgreSQL: "336791",
  Express: "000000",
  C: "00599C",
  Bash: "4EAA25",
};

function badge(name) {
  const color = colors[name] || "0D1117";

  return `<img src="https://img.shields.io/badge/${encodeURIComponent(
    name
  )}-${color}?style=flat-square&logo=${encodeURIComponent(
    name.toLowerCase()
  )}&logoColor=white" />`;
}

async function fetchRepo(repo) {
  const res = await fetch(
    `https://api.github.com/repos/${username}/${repo}`
  );

  return await res.json();
}

async function fetchLanguages(repo) {
  const res = await fetch(
    `https://api.github.com/repos/${username}/${repo}/languages`
  );

  return await res.json();
}

(async () => {
  let html = `<table width="100%">`;

  for (let i = 0; i < featuredRepos.length; i += 2) {
    html += `<tr>`;

    for (let j = i; j < i + 2; j++) {
      if (!featuredRepos[j]) break;

      const repoName = featuredRepos[j];

      const repo = await fetchRepo(repoName);
      const langs = await fetchLanguages(repoName);

      const topLangs = Object.keys(langs).slice(0, 3);

      const badges = topLangs.map(badge).join("\n");

      html += `
<td width="50%" valign="top">
  <h3>⬡ &nbsp;${repo.name}</h3>

  <p>
    ${badges}
  </p>

  <p>
    ${repo.description || "No description"}
  </p>

  <a href="${repo.html_url}">
    <img src="https://img.shields.io/badge/Repository-0D1117?style=for-the-badge&logo=github&logoColor=00D4FF" />
  </a>

  ${
    repo.homepage
      ? `
  <a href="${repo.homepage}">
    <img src="https://img.shields.io/badge/Live-0D1117?style=for-the-badge&logoColor=00D4FF" />
  </a>`
      : ""
  }
</td>
`;
    }

    html += `</tr>`;
  }

  html += `</table>`;

  const readme = fs.readFileSync("README.md", "utf8");

  const updated = readme.replace(
    /<!-- START_PROJECTS -->([\s\S]*?)<!-- END_PROJECTS -->/,
    `<!-- START_PROJECTS -->\n${html}\n<!-- END_PROJECTS -->`
  );

  fs.writeFileSync("README.md", updated);

  console.log("README updated.");
})();
