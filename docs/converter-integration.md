# aozora-converter-for-dopagaki 連携

`aozora-converter-for-dopagaki` は、Alphapolis作品またはローカルTXTをPC上で
変換し、同一LAN内の `dopagaki-bunko` へ渡す任意の連携ツールである。

## 依存関係

- ビルド依存・npm依存・CDN依存はない
- `dopagaki-bunko` 単体の動作にはコンバーターを必要としない
- 連携時だけ、PCのローカルHTTPサーバーとブラウザ `postMessage` を使う
- GitHub Pagesへ変換本文や配送履歴をアップロードしない

## 利用手順

1. PCでコンバーターの `1. アルファポリス作品をまとめて送る.bat` または
   `2. 自作TXTを送る.bat` を起動する。
2. converterの起動ログにある `[serve:pc-url]` のURLを「作品を取り込む」の `PCのURL` に入力する。
3. `PCからプレビューを開く` を押す。
4. 中継タブからアプリへ戻り、内容を確認して保存する。
5. 複数作品では `更新して次へ`、最後は `更新して完了` を押す。

ベースURLは候補一覧を開く。`/works/<作品>.txt` まで指定したURLは一作品を
直接開く。`PCの最新作を読む` や `latest.json` は通常導線ではない。

## 連携契約

- 送信側の配送状態の正本: `.dopagaki-delivery.sqlite3`
- 公開候補ビュー: `works.json`
- 受信側の記録: IndexedDB `importReceipts`
- 作品の安定ID: `aozoraWorkId`、次に正規化した `sourceUrl`
- 配送単位のID: `deliveryId`
- 中継メッセージ: `dopagaki-bridge-import-v1`
- ACK: 作品の保存が永続化された後、中継タブから `__dopagaki_ack__` へ返す

受信しただけでACKしてはいけない。保存済みなのにPC側一覧の更新だけ失敗した
場合は、画面の `送信リストを更新して次へ` / `完了` からACKを再送する。

## 中継タブを分ける理由

GitHub PagesのHTTPS originとPC側LAN HTTP originは別物であり、IndexedDBも
originごとに分離される。アプリ本体をPC側URLへ遷移させず、中継タブにLAN通信を
担当させることで、アプリの保存状態と画面状態を維持する。

## 障害の切り分け

- 起動ログの `[serve:pc-url]` がスマホで開くか確認する
- PCとスマホが同じ信頼できるLANにいるか確認する
- PC側の配信ウィンドウとWindowsファイアウォールを確認する
- 中継タブを閉じず、アプリタブへ戻ってプレビューを確認する
- 保存後に一覧が進まない場合はACK再送ボタンを使う

公衆Wi-Fiでは使用しない。PC側サーバーは本文をLANへ平文HTTPで公開する。
