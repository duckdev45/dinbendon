# 常用店家（便當／飲料／點心）

## 結果（驗收）
- 後台分頁改成「訂單統計｜便當｜飲料｜點心」。
- 開過的團自動變成常用店家（同一家取最後一次的店名、照片、品項、單價），舊的團也算，不用補資料。
- 每個分頁底下有「常用 X 店家」：點一家可以改品項／單價／照片（飲料是 logo＋加料）、改名、刪掉；也能新增一家。
- 開團時「常用店家」下拉（便當、點心）／拉霸（飲料）用的就是這份清單；點心團有開過的店家才出現下拉。
- 刪掉的店家不再出現；之後又用同一家開團會自動回來。

## 不做
- 開團存檔（adminSaveWeek）不寫 shops 表：開過的團由前端從 weeks 算，存團的路徑完全不動。
- 圖片不搬 Drive：照片、logo 留在 public/（Vercel CDN），舊週次存的是 menus/xxx.jpg 路徑。

## 資料
- 新工作表 `shops`：kind, shop, imageUrl, items, addons, hidden, updatedAt；一種團一家一列，第一次用到自動建立。
- 同一家取最新：匯入的內建店家（updatedAt = 1970，最舊）< 開過的團／手動維護（updatedAt）。
- 內建店家已搬進 shops 表（2026-10-21 正式環境匯入），程式裡的寫死清單、匯入按鈕、`adminImportShops` 都已刪掉；要找原始資料看 git 歷史的 `src/shops.ts`。
- 新動作 `adminSaveShop`；`adminListWeeks` 多回 `shops`，不多一次往返。舊版 Code.gs 沒有 shops 時只顯示開過的團（飲料拉霸沒店可抽時改顯示提示）。

## 驗證
- `pnpm test`：`test/shops.test.ts`。
- demo 模式 headless：改名、改價、刪除、新增、選常用店家帶入品項、手機寬度不溢出。
