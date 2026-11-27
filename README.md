
PoE 1 當期聯盟行情、通貨換算、傳奇與技能石估價，以及手動交易試算。GitHub Actions 於每小時的第 17、47 分更新快照，可在 Actions 手動更新。頁面讀取 GitHub Pages 上的快照。

- 跨幣價差比較「Chaos 買、Div 賣」與「Div 買、Chaos 賣」。兩邊價格都取自同一小時的 GGG 直接交易對成交均價，缺任一交易對就留白。
- 毛利為賣價減買價，兩側按 poe.ninja 參考匯率統一以 Chaos 計價。報酬率為毛利除以該路線的買入成本，按較高的毛利排序。成交摘要未區分買賣掛單，試算時可改填目前掛單價。
- 物品買入上限以參考價除以（1 + 目標報酬率）計算。
- GGG 小時匯率以該小時的 Chaos 成交量除以 Divine 成交量。
- 試算淨利扣除輸入的額外 Chaos 成本。每千金幣毛利使用輸入的總金幣費用。

本機使用 Node.js 22 或更新版。先執行 `node scripts/refresh-market.mjs`，再執行 `npx --yes serve site`，開啟終端機顯示的網址。

繁中名稱取自 [PobTools-zh](https://github.com/Hsiung-Shao/PobTools-zh/blob/main/NOTICE.md) 的 PoE 1 `zh-rTW` 詞庫。缺漏的部分品項用[流亡編年史](https://poedb.tw/tw/)的繁中品項頁補齊。遊戲資料著作權屬 Grinding Gear Games。搜尋接受英文與繁中，未收錄的名稱保留英文。

詞庫更新後，先更新行情，再執行 `node scripts/export-item-names.mjs "<PoB 引擎>/Data/poe1/zh-rTW" site/data/market.json` 重建繁中名稱表。
