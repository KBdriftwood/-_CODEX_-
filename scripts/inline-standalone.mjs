import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(
  new URL("../dist-standalone/", import.meta.url),
);
let html = await readFile(resolve(directory, "index.html"), "utf8");
const licenses = await Promise.all(
  ["react", "react-dom", "scheduler", "three", "lucide-react"].map(
    async (name) => {
      const license = await readFile(
        new URL(`../node_modules/${name}/LICENSE`, import.meta.url),
        "utf8",
      );
      return `${name}\n${license}`;
    },
  ),
);
const notices = licenses.join(
  "\n\n========================================\n\n",
);

async function assetContents(path) {
  const absolute = resolve(directory, path);
  if (
    !absolute.startsWith(directory.endsWith(sep) ? directory : directory + sep)
  ) {
    throw new Error("出力フォルダー外のファイルは埋め込めません。");
  }
  return readFile(absolute, "utf8");
}

const scripts = [
  ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g),
];
if (scripts.length !== 1)
  throw new Error("確認用HTMLには単一のJavaScriptバンドルが必要です。");
for (const [tag, path] of scripts) {
  const code = await assetContents(path);
  html = html.replace(
    tag,
    () =>
      `<script type="module">\n${code.replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
}

for (const [tag, path] of [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
]) {
  const css = await assetContents(path);
  html = html.replace(
    tag,
    () => `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`,
  );
}

const icon = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
  "utf8",
);
html = html.replace(
  /href="[^"]*favicon\.svg"/,
  () =>
    `href="data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}"`,
);
html = html.replace(
  '<div id="root"></div>',
  `<div id="root"><main style="padding:32px;font-family:Meiryo,sans-serif"><h1>LP VISION 確認版</h1><p>アプリを読み込んでいます。</p><p>この案内が消えない場合は、HTMLファイルをパソコンに保存し、EdgeまたはChromeで開いてください。</p></main></div>`,
);

const output = resolve(directory, "LP-VISION.html");
html = html.replace(
  "</head>",
  () =>
    `<script type="text/plain" id="third-party-notices">\n${notices.replace(/<\/script/gi, "<\\/script")}\n</script>\n</head>`,
);
await writeFile(output, html);
await writeFile(resolve(directory, "THIRD-PARTY-NOTICES.txt"), notices);
await writeFile(
  resolve(dirname(output), "開き方.txt"),
  `LP VISION 確認版\n\n1. ZIPから取り出したLP-VISION.htmlをパソコンに保存します。\n2. LP-VISION.htmlを右クリックし、「プログラムから開く」でMicrosoft EdgeまたはGoogle Chromeを選びます。\n3. サンプル背景と仮バルクが表示されたら、「写真を読み込む」から現場写真を選べます。\n4. 移動・回転・カメラ・表示倍率を調整し、「PNG保存」で画像を保存します。\n\nインストール、ログイン、インターネット接続は不要です。写真を外部へ送信しません。\n寸法・色・形状は操作確認用の仮モデルです。\nページを閉じたり再読み込みしたりすると、編集内容は初期化されます。\n3D表示にはブラウザのWebGL 2が必要です。\n`,
);
console.log(
  `確認用ファイル: ${output} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`,
);
