
PoE 1 當期聯盟行情、通貨換算、傳奇與技能石估價，以及手動交易試算。GitHub Actions 於每小時的第 17、47 分更新快照，可在 Actions 手動更新。頁面讀取 GitHub Pages 上的快照。

- 通貨價差為 poe.ninja 交換估價減去倉庫估價，每件以 Chaos 計價。
- 物品買入上限以參考價除以（1 + 目標報酬率）計算。
- GGG 小時匯率以該小時的 Chaos 成交量除以 Divine 成交量。
- 試算淨利扣除輸入的額外 Chaos 成本。每千金幣毛利使用輸入的總金幣費用。

本機使用 Node.js 22 或更新版。先執行 `node scripts/refresh-market.mjs`，再執行 `npx --yes serve site`，開啟終端機顯示的網址。
