
PoE 1 當期聯盟的弗斯特通貨交換行情與整批交易試算。GitHub Actions 排程設在每小時的第 17、47 分，也可在 Actions 手動更新。頁面讀取 GitHub Pages 上的快照。

- 跨幣價差比較「Chaos 買、Div 賣」與「Div 買、Chaos 賣」。兩邊價格都取自同一小時的 GGG 直接交易對成交均價。任一交易對缺資料、成交件數低於門檻（預設 5）或低於整批件數時，價差留白。
- 毛利為賣價減買價，兩側按 poe.ninja 參考匯率統一以 Chaos 計價。報酬率為毛利除以該路線的買入成本，按較高的毛利排序。成交摘要未區分買賣掛單，試算時可改填目前掛單價。
- 價差按整批計算。每件成交均價乘件數後，買入預算向上取整，賣出收入向下取整。手動試算輸入整數通貨總價。
- 每批件數留空時，各品項使用可同時換到至少 1 C、1 D 的最小整批件數。填入件數則讓所有列用同一個批量。
- 整批買入上限以每件參考價乘件數、除以（1 + 目標報酬率），再向下取整。
- GGG 小時匯率以該小時的 Chaos 成交量除以 Divine 成交量。
- 試算淨利扣除輸入的額外 Chaos 成本。每千金幣毛利使用輸入的總金幣費用。

本機使用 Node.js 22 或更新版。先執行 `node scripts/refresh-market.mjs`，再執行 `npx --yes serve site`，開啟終端機顯示的網址。

弗斯特品項、分類和繁中名稱使用[流亡編年史通貨交換清單](https://poedb.tw/tw/Currency_Exchange)。用 [RePoE](https://repoe-fork.github.io/) 的遊戲物品 ID 對照 GGG 成交資料。搜尋支援繁中與英文。遊戲資料著作權屬 Grinding Gear Games。

更新清單時，下載流亡編年史的[繁中](https://poedb.tw/tw/Currency_Exchange)與[英文](https://poedb.tw/us/Currency_Exchange)頁面及 [RePoE base_items.json](https://repoe-fork.github.io/base_items.json)，再執行 `node scripts/export-faustus-catalog.mjs tw.html en.html base_items.json`。

API 狀態區分正常回應、請求失敗與 HTTP 429。收到限流時停止向該來源繼續發送請求。有 `Retry-After` 或 GGG 限流狀態秒數才顯示倒數。頁面的「重讀快照」只讀 GitHub Pages。
