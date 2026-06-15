# CODEX_TASKS.md

Codexに順番に渡すための作業分解です。
一度に全部やらせず、上から1つずつ実行させてください。

## 0. 最初に渡す共通指示

```text
AGENTS.md、SPEC.md、docs/dependencies.mdを読んだうえで作業してください。
外部依存、npm install、外部CDNは禁止です。
GitHub Pagesでmainブランチのルートから公開できる静的Webアプリとして実装してください。
```

## Phase 1: 最小画面

### Task 1

```text
index.html、styles/base.css、src/main.jsを使って、依存なしの静的Webアプリの初期画面を実装してください。
画面はホームTL、ライブラリ、検索、設定の下部ナビを持つ構成にしてください。
まだデータ保存は不要です。
```

### Task 2

```text
サンプル作品3件とサンプル断片をsrc/sample-data.jsに定義し、ホームタイムラインに表示してください。
タイムライン上には作品名と本文だけを表示し、アイコン、投稿日時、いいね等の操作アイコンは表示しないでください。
```

### Task 3

```text
断片カードをクリックすると、断片個別ページを表示するルーティングを実装してください。
依存なしでlocation.hashを使ってください。
個別ページには作品名、著者名、本文、前へ、次へ、いいね、しおり、引用保存ボタンを表示してください。
```

## Phase 2: 保存

### Task 4

```text
src/db.jsにIndexedDBの最小ラッパーを実装してください。
外部ライブラリは禁止です。
storesはworks, fragments, progress, likes, bookmarks, quotes, settingsです。
```

### Task 5

```text
サンプルデータをIndexedDBに初期投入し、ホームTLをIndexedDBから描画するように変更してください。
初期投入はDBが空のときだけ行ってください。
```

### Task 6

```text
個別ページのいいね、しおり、引用保存をIndexedDBに保存してください。
保存済み状態も表示してください。
```

## Phase 3: バックアップ

### Task 7

```text
src/export-import.jsを実装し、全データをJSONでエクスポートできるようにしてください。
BlobとURL.createObjectURLを使い、外部依存は禁止です。
```

### Task 8

```text
JSONインポート機能を実装してください。
インポート前に確認画面を出し、既存データを上書きするか追加するか選べるようにしてください。
```

## Phase 4: 青空文庫テキスト処理

### Task 9

```text
src/aozora-text-decoder.jsを実装してください。
ArrayBufferをShift_JISとしてTextDecoderで文字列化する関数を作ってください。
UTF-8 fallbackも用意してください。
```

### Task 10

```text
src/aozora-cleaner.jsを実装してください。
青空文庫テキストのヘッダ、注記説明、フッタ、底本情報を可能な範囲で除去してください。
完全対応ではなく、プレビューで修正できる前提のヒューリスティックでよいです。
```

### Task 11

```text
src/aozora-ruby.jsを実装してください。
青空文庫のルビ記法をHTMLのruby/rtへ変換してください。
HTMLエスケープを必ず行い、XSSを避けてください。
```

### Task 12

```text
src/aozora-emphasis.jsを実装してください。
青空文庫の圏点記法をCSS text-emphasisで表示できるspanへ変換してください。
対応できない注記は安全に除去またはプレーンテキスト化してください。
```

### Task 13

```text
src/fragmenter.jsを実装してください。
本文を60〜160字、最大220字程度の断片に分割してください。
句点、改行、会話文の切れ目を優先してください。
ルビや圏点の途中で分割しないようにしてください。
```

## Phase 5: ZIP取り込み

### Task 14

```text
src/aozora-zip-importer.jsに、青空文庫ZIP専用の最小ZIPリーダーを実装してください。
外部ライブラリは禁止です。
対応はstore方式とdeflate方式のtxt抽出のみです。
ZIP64、パスワード付きZIP、分割ZIPは非対応でエラー表示してください。
```

### Task 15

```text
作品取り込み画面を実装してください。
ZIPをドラッグ＆ドロップまたはファイル選択し、txt抽出、文字コード変換、本文クリーニング、ルビ・圏点変換、断片化、プレビューまで行ってください。
保存前に作品名・著者名・断片数・最初の数断片を確認できるようにしてください。
```

## Phase 6: GitHub Pages仕上げ

### Task 16

```text
GitHub Pagesでルート公開できるように、相対パス、manifest、アイコン、404時の扱いを確認してください。
ビルド工程は追加しないでください。
```

### Task 17

```text
README.mdに、GitHub Pagesで公開する手順、ローカル起動手順、データバックアップ手順を追記してください。
```
