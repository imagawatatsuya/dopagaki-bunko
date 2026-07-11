# 依存管理方針

## 原則

このプロジェクトはサプライチェーン攻撃リスクを下げるため、依存を極力追加しない。

## 現在の外部依存

なし。

## 任意の実行時連携

`aozora-converter-for-dopagaki` とは、パッケージやビルド依存を持たず、利用時だけ
LAN HTTPとブラウザ `postMessage` で連携する。`dopagaki-bunko` 単体の動作には
不要であり、外部コードを本アプリへ読み込まない。契約は
[converter-integration.md](converter-integration.md) に記載する。

## 禁止

- npm dependencies
- CDN script
- CDN stylesheet
- 外部フォント
- UIフレームワーク
- ZIPライブラリ
- IndexedDBラッパー

## 例外条件

どうしても依存を追加する場合は、以下をこのファイルに追記してから検討する。

- 依存名
- 必要な理由
- 標準APIで代替できない理由
- セキュリティ上の懸念
- 削除可能性
- 代替案

## ZIP対応

JSZipは使わない。
青空文庫ZIPに必要な最小機能だけ自作する。
