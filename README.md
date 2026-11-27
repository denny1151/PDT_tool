
PoE 1 當期聯盟行情、通貨換算、傳奇與技能石估價，以及手動交易試算。GitHub Actions 於每小時的第 17、47 分更新快照，可在 Actions 手動更新。頁面讀取 GitHub Pages 上的快照。

- 通貨買入成本優先用 GGG 同一小時的直接交易對成交量比值。缺交易對時採 poe.ninja 倉庫估價，Div 成本按參考匯率換算。圖示檔名只有在兩個來源皆唯一時才用於對照 GGG 品項。
- 每件毛利為 poe.ninja 交換估價減去買入成本，報酬率為毛利除以買入成本。兩種付款方式的毛利統一用 Chaos 計價，預設按較高者由高到低排序。
- 物品買入上限以參考價除以（1 + 目標報酬率）計算。
- GGG 小時匯率以該小時的 Chaos 成交量除以 Divine 成交量。
- 試算淨利扣除輸入的額外 Chaos 成本。每千金幣毛利使用輸入的總金幣費用。

本機使用 Node.js 22 或更新版。先執行 `node scripts/refresh-market.mjs`，再執行 `npx --yes serve site`，開啟終端機顯示的網址。

繁中名稱取自 [PobTools-zh](https://github.com/Hsiung-Shao/PobTools-zh/blob/main/NOTICE.md) 的 PoE 1 `zh-rTW` 詞庫。缺漏的部分品項用[流亡編年史](https://poedb.tw/tw/)的繁中品項頁補齊。遊戲資料著作權屬 Grinding Gear Games。搜尋接受英文與繁中，未收錄的名稱保留英文。

詞庫更新後，先更新行情，再執行 `node scripts/export-item-names.mjs "<PoB 引擎>/Data/poe1/zh-rTW" site/data/market.json` 重建繁中名稱表。
