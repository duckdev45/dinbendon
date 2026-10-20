/**
 * 甲奔！dinbendon 後端
 * 綁定在 Google Sheet 上的 Apps Script（試算表 → 擴充功能 → Apps Script）。
 *
 * 指令碼屬性（專案設定 → 指令碼屬性）：
 *   ADMIN_PASSWORD   負責人密碼（必填）
 *   IMAGE_FOLDER_ID  菜單圖片要放的 Drive 資料夾 ID（選填，沒填會自動建一個「dinbendon 菜單」）
 *
 * 第一次部署前先在編輯器執行一次 setup()，會建立 weeks / orders 兩張工作表。
 */

var WEEK_COLS = ['id', 'shop', 'imageUrl', 'deadline', 'items', 'note', 'createdAt', 'updatedAt'];
var ORDER_COLS = ['id', 'weekId', 'name', 'itemId', 'itemName', 'price', 'qty', 'note', 'createdAt', 'updatedAt'];

// ───────────────────────── 進入點

function doGet() {
  return json_({ ok: true, data: 'dinbendon api ok' });
}

function doPost(e) {
  try {
    var p = JSON.parse((e.postData && e.postData.contents) || '{}');
    var fn = ACTIONS[p.action];
    if (!fn) throw new Error('未知的動作：' + p.action);
    return json_({ ok: true, data: fn(p) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

var ACTIONS = {
  getCurrent: function () {
    var week = latestWeek_();
    return snapshot_(week);
  },

  placeOrder: function (p) {
    return withLock_(function () {
      var week = findWeek_(p.weekId);
      if (!week) throw new Error('找不到這週的菜單，重新整理看看');
      if (Date.now() >= new Date(week.deadline).getTime()) throw new Error('已經截止囉，下週請早');
      var item = week.items.filter(function (i) { return i.id === p.itemId; })[0];
      if (!item) throw new Error('這個便當已經被負責人拿掉了，重新整理再選一次');
      var name = String(p.name || '').trim().slice(0, 20);
      if (!name) throw new Error('要填名字，負責人才知道便當是誰的');
      var qty = Math.max(1, Math.min(20, Math.floor(Number(p.qty)) || 1));
      var now = new Date().toISOString();

      var sheet = sheet_('orders');
      var rows = readRows_(sheet, ORDER_COLS);
      var hit = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].weekId === week.id && norm_(rows[i].name) === norm_(name)) { hit = i; break; }
      }
      var order = {
        id: hit >= 0 ? rows[hit].id : uid_('o_'),
        weekId: week.id,
        name: name,
        itemId: item.id,
        itemName: item.name,
        price: Number(item.price),
        qty: qty,
        note: String(p.note || '').trim().slice(0, 100),
        createdAt: hit >= 0 ? rows[hit].createdAt : now,
        updatedAt: now,
      };
      writeRow_(sheet, ORDER_COLS, order, hit >= 0 ? hit + 2 : null);
      return castOrder_(order);
    });
  },

  cancelOrder: function (p) {
    return withLock_(function () {
      var week = findWeek_(p.weekId);
      if (week && Date.now() >= new Date(week.deadline).getTime()) throw new Error('已經截止，不能取消了，請直接找負責人');
      var sheet = sheet_('orders');
      var rows = readRows_(sheet, ORDER_COLS);
      for (var i = rows.length - 1; i >= 0; i--) {
        if (rows[i].weekId === p.weekId && norm_(rows[i].name) === norm_(p.name)) sheet.deleteRow(i + 2);
      }
      return null;
    });
  },

  adminVerify: function (p) {
    auth_(p);
    return null;
  },

  adminListWeeks: function (p) {
    auth_(p);
    return allWeeks_();
  },

  adminGetWeek: function (p) {
    auth_(p);
    return snapshot_(findWeek_(p.weekId));
  },

  adminSaveWeek: function (p) {
    auth_(p);
    return withLock_(function () {
      var w = p.week || {};
      if (!w.id) throw new Error('缺少菜單 id');
      var sheet = sheet_('weeks');
      var rows = readRows_(sheet, WEEK_COLS);
      var hit = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === w.id) { hit = i; break; }
      var now = new Date().toISOString();
      var items = (w.items || []).map(function (it) {
        return { id: String(it.id), name: String(it.name).trim(), price: Number(it.price) || 0 };
      });
      var row = {
        id: String(w.id),
        shop: String(w.shop || ''),
        imageUrl: String(w.imageUrl || ''),
        deadline: new Date(w.deadline).toISOString(),
        items: JSON.stringify(items),
        note: String(w.note || ''),
        createdAt: hit >= 0 ? rows[hit].createdAt : now,
        updatedAt: now,
      };
      writeRow_(sheet, WEEK_COLS, row, hit >= 0 ? hit + 2 : null);
      return castWeek_(row);
    });
  },

  adminUploadImage: function (p) {
    auth_(p);
    var m = String(p.dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
    if (!m) throw new Error('圖片格式不對');
    var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], p.filename || 'menu.jpg');
    var file = imageFolder_().createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      // 公司 Workspace 不允許對外分享時，改成網域內有連結即可看
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    }
    return 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1600';
  },

  adminDeleteOrder: function (p) {
    auth_(p);
    return withLock_(function () {
      var sheet = sheet_('orders');
      var rows = readRows_(sheet, ORDER_COLS);
      for (var i = rows.length - 1; i >= 0; i--) if (rows[i].id === p.orderId) sheet.deleteRow(i + 2);
      return null;
    });
  },
};

// ───────────────────────── 第一次使用

function setup() {
  ensureSheet_('weeks', WEEK_COLS);
  ensureSheet_('orders', ORDER_COLS);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) {
    Logger.log('⚠ 還沒設定 ADMIN_PASSWORD：專案設定 → 指令碼屬性 → 新增');
  }
  imageFolder_(); // 順便觸發 Drive 授權
  Logger.log('完成，可以部署成網頁應用程式了');
}

// ───────────────────────── 資料

function allWeeks_() {
  return readRows_(sheet_('weeks'), WEEK_COLS)
    .map(castWeek_)
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function latestWeek_() {
  return allWeeks_()[0] || null;
}

function findWeek_(id) {
  return allWeeks_().filter(function (w) { return w.id === id; })[0] || null;
}

function snapshot_(week) {
  if (!week) return { week: null, orders: [] };
  var orders = readRows_(sheet_('orders'), ORDER_COLS)
    .filter(function (o) { return o.weekId === week.id; })
    .map(castOrder_)
    .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  return { week: week, orders: orders };
}

function castWeek_(r) {
  var items = r.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items || '[]'); } catch (e) { items = []; }
  }
  return {
    id: r.id, shop: r.shop, imageUrl: r.imageUrl, deadline: r.deadline,
    items: items, note: r.note, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

function castOrder_(r) {
  return {
    id: r.id, weekId: r.weekId, name: r.name, itemId: r.itemId, itemName: r.itemName,
    price: Number(r.price) || 0, qty: Number(r.qty) || 1, note: r.note,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

// ───────────────────────── 試算表工具

function sheet_(name) {
  return ensureSheet_(name, name === 'weeks' ? WEEK_COLS : ORDER_COLS);
}

function ensureSheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // 全部存成純文字：避免 Sheets 把 ISO 時間、名字自動轉格式，也防止公式注入
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
  return values.map(function (row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = row[i]; });
    return o;
  });
}

/** rowIndex 為 null 時新增在最後一列 */
function writeRow_(sh, cols, obj, rowIndex) {
  var values = [cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); })];
  var r = rowIndex || sh.getLastRow() + 1;
  var range = sh.getRange(r, 1, 1, cols.length);
  range.setNumberFormat('@');
  range.setValues(values);
}

function imageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('dinbendon 菜單');
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

// ───────────────────────── 其他

function auth_(p) {
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) throw new Error('後端還沒設定 ADMIN_PASSWORD');
  if (String(p.password || '') !== pw) throw new Error('密碼不對');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('太多人同時在點，等幾秒再按一次');
  try {
    SpreadsheetApp.flush();
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function norm_(s) {
  return String(s || '').trim().toLowerCase();
}

function uid_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
