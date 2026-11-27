
PoE 1 當期聯盟的弗斯特通貨交換行情與整批交易試算。GitHub Actions 抓取行情並發布快照，頁面從 GitHub Pages 讀取。

- 跨幣價差比較「Chaos 買、Div 賣」與「Div 買、Chaos 賣」。兩邊價格都取自同一小時的 GGG 直接交易對成交均價。任一交易對缺資料、成交件數低於門檻（預設 5）或低於整批件數時，價差留白。
- 毛利為賣價減買價，兩側按 poe.ninja 參考匯率統一以 Chaos 計價。報酬率為毛利除以該路線的買入成本，按較高的毛利排序。成交摘要未區分買賣掛單，試算時可改填目前掛單價。
- 價差按整批計算。每件成交均價乘件數後，買入預算向上取整，賣出收入向下取整。手動試算輸入整數通貨總價。
- 每批件數留空時，各品項使用可同時換到至少 1 C、1 D 的最小整批件數。填入件數則讓所有列用同一個批量。
- 整批買入上限以每件參考價乘件數、除以（1 + 目標報酬率），再向下取整。
- GGG 小時匯率以該小時的 Chaos 成交量除以 Divine 成交量。
- 試算淨利扣除輸入的額外 Chaos 成本。每千金幣毛利使用輸入的總金幣費用。

本機使用 Node.js 22 或更新版。先執行 `node scripts/refresh-market.mjs`，再執行 `npx --yes serve site`，開啟終端機顯示的網址。

## 公開抓價（Vercel Hobby）

網站部署在 GitHub Pages。按「重新抓價」會呼叫 Vercel 上的 Python API，再由 GitHub Actions 向 GGG 和 poe.ninja 抓價、發布共用快照。訪客不用登入或提供權杖。公開請求共用 10 分鐘冷卻。新快照發布後，頁面會自動載入。

1. 在 Vercel 選免費 Hobby，匯入 `denny1151/PDT_tool`，Root Directory 選 `backend`，Framework Preset 選 FastAPI，部署不受 Vercel Authentication 保護的 Production 網址。
2. 在 GitHub 建立細粒度權杖，Resource owner 選 `denny1151`，Repository access 只選 `PDT_tool`，權限選 Actions → Read and write。在 Vercel 設定 Production 機密環境變數 `PDT_GITHUB_TOKEN`，新增或更換後重新部署 Vercel。
3. 在 GitHub 儲存庫 Settings → Secrets and variables → Actions → Variables 建立 `PDT_REFRESH_API_URL`，填入 Vercel Production 網址加上 `/api/refresh`，例如 `https://pdt-tool.vercel.app/api/refresh`。
4. 在 GitHub Actions 手動執行 `Update market and publish Pages`，把 API 網址發布到 Pages。

尚未設定 `PDT_REFRESH_API_URL` 時，網頁的「重新抓價」仍使用管理者的 GitHub 權杖。管理者也可直接在 GitHub Actions 手動執行 `Update market and publish Pages`。

弗斯特品項、分類和繁中名稱使用[流亡編年史通貨交換清單](https://poedb.tw/tw/Currency_Exchange)。用 [RePoE](https://repoe-fork.github.io/) 的遊戲物品 ID 對照 GGG 成交資料。搜尋支援繁中與英文。遊戲資料著作權屬 Grinding Gear Games。

更新清單時，下載流亡編年史的[繁中](https://poedb.tw/tw/Currency_Exchange)與[英文](https://poedb.tw/us/Currency_Exchange)頁面及 [RePoE base_items.json](https://repoe-fork.github.io/base_items.json)，再執行 `node scripts/export-faustus-catalog.mjs tw.html en.html base_items.json`。

API 狀態區分正常回應、請求失敗與 HTTP 429。收到限流時停止向該來源繼續發送請求。有 `Retry-After` 或 GGG 限流狀態秒數才顯示倒數。頁面的「重讀快照」只讀 GitHub Pages。
