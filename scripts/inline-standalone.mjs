import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(
  new URL("../dist-standalone/", import.meta.url),
);
let html = await readFile(resolve(directory, "index.html"), "utf8");
const licenses = await Promise.all(
  [
    "react",
    "react-dom",
    "scheduler",
    "three",
    "lucide-react",
    "pdf-lib",
    "@pdf-lib/standard-fonts",
    "@pdf-lib/upng",
    "pako",
    "tslib",
  ].map(async (name) => {
    const license = await readFile(
      new URL(
        `../node_modules/${name}/${["pdf-lib", "@pdf-lib/standard-fonts"].includes(name) ? "LICENSE.md" : name === "tslib" ? "CopyrightNotice.txt" : "LICENSE"}`,
        import.meta.url,
      ),
      "utf8",
    );
    return `${name}\n${license.replace(/\r\n?/g, "\n").trimEnd()}`;
  }),
);
const notices = licenses.join(
  "\n\n========================================\n\n",
);

// JS内の印刷用HTMLにも </head> が含まれるため、バンドル埋め込み前に挿入する。
html = html.replace(
  "</head>",
  () =>
    `<script type="text/plain" id="third-party-notices">\n${notices.replace(/<\/script/gi, "<\\/script")}\n</script>\n</head>`,
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

await writeFile(output, html);
await writeFile(resolve(directory, "THIRD-PARTY-NOTICES.txt"), notices);
await writeFile(
  resolve(dirname(output), "開き方.txt"),
  `LP VISION 確認版\n\n1. ZIPから取り出したLP-VISION.htmlをパソコンに保存します。\n2. LP-VISION.htmlを右クリックし、「プログラムから開く」でMicrosoft EdgeまたはGoogle Chromeを選びます。\n3. サンプル背景と仮の縦バルクが表示されたら、「写真を読み込む」から現場写真を選べます。\n4. 設備一覧から縦・横バルク、基礎、障壁、VR、熱源器、配管を追加します。選択した設備を移動・回転・表示倍率で調整します。カメラの向き・見下ろし角度・遠近感も選択した設備だけに反映します。配管の長さは、消して入力し直し、Enterキーか入力欄を離れたときに反映します。設備の長さ・形・回転に合わせて影も変わります。「影の向き」ボタンで右下→左下→左上→右上を切り替え、全設備の影をそろえます。\n「設備の明るさ」で選択中の設備を自動補正・手動調整できます。自動補正は初期状態で有効で、配置先の背景に控えめに合わせます。「明るさの微調整」は50〜150%です。「明るさを元に戻す」で自動補正を解除して元の明るさに戻します。位置・回転・他の設備は変更しません。\n5. 「PNG保存」で完成予想の画像を保存できます。\n6. 「2 比較・提案書」で元写真と完成予想を比較します。写真を拡大することもできます。\n7. A4縦（上下）かA4横（左右）を選び、お客様名などを入力します。「印刷プレビュー」で確認し、「比較ページを印刷」または「切替提案書PDFを保存」を押します。\n8. 見積書はExcel、提案書はWordで「名前を付けて保存」または印刷の「Microsoft Print to PDF」を使い、図面もPDFにしてから「ほかのPDFを追加」で読み込みます。上下ボタンで順番を整えて保存すると、1つのPDFになります。\n9. メールで送る際は保存したPDFを普段のメールに添付してください。「メール作成画面を開く」は本文の下書きだけです。添付・送信はご自身で行います。\n\n写真を直すときは「写真を簡易修復」を押します。「修復元を選ぶ」で何もない壁や地面をクリックし、消したい範囲をドラッグします。ブラシの大きさ・境界のぼかしを調整し、修復元を選び直しながら少しずつ塗ります。取り消しは直近5回までです。「修復を背景に反映」で配置画面へ戻ります。「反映せず閉じる」は修復を破棄します。元写真は比較用に残ります。修復後の背景は長辺最大4096pxに縮小します。大きな設備・複雑な背景では模様の繰り返しや継ぎ目が残る場合があります。AI消去は未接続です。別のアプリで消去した写真は「加工済み写真を読み込む」から背景にできます。元写真は比較用に保持します。同じ画角・縦横比で保存してください。\nPDFは1ファイル30MB以下・20ファイルまで・合計100MB以下です。パスワード付きPDFは解除したものを使ってください。PDFの並べ替えはファイル単位です。結合後のPDFを開いてから内容・順番を確認してください。\n比較ページは画像としてPDF化するため文字検索はできません。他のPDFページは元の用紙サイズを維持して結合します。\n\nインストール、ログイン、インターネット接続は不要です。写真を外部へ送信しません。\n寸法・色・形状は操作確認用の仮モデルです。\nページを閉じたり再読み込みしたりすると、編集内容は初期化されます。\n3D表示にはブラウザのWebGL 2が必要です。\n`,
);
console.log(
  `確認用ファイル: ${output} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`,
);
