import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(rootDir, 'outputs', 'demo-2026-06-09-v2');
const packageDir = join(rootDir, 'outputs', 'client-preview-package');

const files = [
  'client-preview.html',
  'demo-video.mp4',
  'novel.md',
  'storyboard.json',
  'subtitles.srt'
];

async function ensureSourceFiles() {
  const missing = [];

  for (const file of files) {
    try {
      await stat(join(sourceDir, file));
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing preview package files: ${missing.join(', ')}`);
  }
}

function buildReadme() {
  return `# AIShortvideo 客户样片预览托管包

用途：把这个目录作为一个静态站点上传，让客户能打开 28 秒剧情样片、小说和报价边界。

## 上传文件

请把本目录中的全部文件一起上传：

- client-preview.html
- demo-video.mp4
- novel.md
- storyboard.json
- subtitles.srt

## 推荐托管方式

1. Vercel 静态站点。
2. GitHub Pages。
3. 对象存储或网盘公开目录。

## 发布后检查

1. 打开公开访问地址。
2. 确认视频能播放。
3. 确认“阅读小说”能打开。
4. 确认页面包含 0/29/99/100+ 报价边界。
5. 回到 AIShortvideo 收入页，把公开 URL 填入“公开预览链接”。
6. 再复制客户样片预览包发给对方。

## 重要边界

- 不要把 127.0.0.1 或 localhost 链接发给客户。
- 不承诺爆款、播放量、涨粉、成交或收入。
- 不使用未授权素材。`;
}

async function main() {
  await ensureSourceFiles();
  await rm(packageDir, { force: true, recursive: true });
  await mkdir(packageDir, { recursive: true });

  await Promise.all(
    files.map((file) => copyFile(join(sourceDir, file), join(packageDir, file)))
  );

  await writeFile(join(packageDir, 'README.md'), buildReadme(), 'utf8');
  await writeFile(
    join(packageDir, 'manifest.json'),
    JSON.stringify({
      name: 'AIShortvideo client preview package',
      createdAt: new Date().toISOString(),
      entry: 'client-preview.html',
      files
    }, null, 2),
    'utf8'
  );

  console.log(`Client preview package created: ${packageDir}`);
  console.log('Upload the whole directory, then paste the public URL into the revenue page.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
