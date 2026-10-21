/**
 * 甲奔！dinbendon 後端
 * 綁定在 Google Sheet 上的 Apps Script（試算表 → 擴充功能 → Apps Script）。
 *
 * 指令碼屬性（專案設定 → 指令碼屬性）：
 *   IMAGE_FOLDER_ID  菜單圖片要放的 Drive 資料夾 ID（選填，沒填會自動建一個「dinbendon 菜單」）
 *
 * 第一次部署前先在編輯器執行一次 setup()，會建立 weeks / orders / shops 三張工作表。
 * （舊試算表不用重跑：shops 表第一次用到時自動建立）
 */

// 新欄位只能加在最後：讀寫都照欄位順序，舊試算表的表頭會自動補上
var WEEK_COLS = ['id', 'shop', 'imageUrl', 'deadline', 'items', 'note', 'createdAt', 'updatedAt', 'kind', 'addons', 'host', 'mode'];
var ORDER_COLS = ['id', 'weekId', 'name', 'itemId', 'itemName', 'createdAt', 'updatedAt', 'options', 'addonIds']; // 一人一份；金額照菜單單價＋加料算
// 後台手動維護的常用店家，一種團一家一列；開過的團前端會自動算進常用店家，不寫這張表
var SHOP_COLS = ['kind', 'shop', 'imageUrl', 'items', 'addons', 'hidden', 'updatedAt'];
var COLS = { weeks: WEEK_COLS, orders: ORDER_COLS, shops: SHOP_COLS };

// bento 每週便當；drink / snack 限時的飲料團、點心團（舊資料 kind 空白 = 便當）
var KINDS = ['bento', 'drink', 'snack'];

// 跟前端 src/lib/drink.ts 同一份清單
var SUGAR = ['正常糖', '少糖', '半糖', '微糖', '無糖'];
var ICE = ['正常冰', '少冰', '微冰', '去冰', '溫', '熱'];

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
  // 便當永遠是最新一筆便當菜單；飲料團、點心團只在收單中才回傳
  getCurrent: function () {
    var weeks = allWeeks_();
    var open = function (kind) {
      var w = weeks.filter(function (x) { return x.kind === kind; })[0];
      return w && Date.now() < new Date(w.deadline).getTime() ? snapshot_(w) : null;
    };
    var cur = snapshot_(weeks.filter(function (w) { return w.kind === 'bento'; })[0] || null);
    cur.drink = open('drink');
    cur.snack = open('snack');
    return cur;
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
      var options = '';
      var addonIds = [];
      if (week.kind === 'drink') {
        if (SUGAR.indexOf(p.sugar) < 0) throw new Error('選一下甜度');
        if (ICE.indexOf(p.ice) < 0) throw new Error('選一下冰量');
        // 加料單選：只取菜單上有的第一個
        var picked = week.addons.filter(function (a) { return (p.addonIds || []).indexOf(a.id) >= 0; }).slice(0, 1);
        addonIds = picked.map(function (a) { return a.id; });
        options = [p.sugar, p.ice].concat(picked.map(function (a) { return '+' + a.name; })).join(' ');
      }
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
        createdAt: hit >= 0 ? rows[hit].createdAt : now,
        updatedAt: now,
        options: options,
        addonIds: JSON.stringify(addonIds),
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
    return null;
  },

  // 順便帶最新一團的訂單和常用店家，後台進來只要打一次（Apps Script 每次呼叫都要 1–3 秒）
  adminListWeeks: function (p) {
    var weeks = allWeeks_();
    return { weeks: weeks, latest: snapshot_(weeks[0] || null), shops: allShops_() };
  },

  adminGetWeek: function (p) {
    return snapshot_(findWeek_(p.weekId));
  },

  adminSaveWeek: function (p) {
    return withLock_(function () {
      var w = p.week || {};
      if (!w.id) throw new Error('缺少菜單 id');
      var sheet = sheet_('weeks');
      var rows = readRows_(sheet, WEEK_COLS);
      var hit = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === w.id) { hit = i; break; }
      if (hit >= 0 && String(w.shop || '') !== rows[hit].shop) {
        var ordered = readRows_(sheet_('orders'), ORDER_COLS).some(function (o) { return o.weekId === w.id; });
        if (ordered) throw new Error('已經有人點了，不能換店家');
      }
      var now = new Date().toISOString();
      var clean = function (it) {
        return { id: String(it.id), name: String(it.name).trim(), price: Math.max(0, Math.round(Number(it.price) || 0)) };
      };
      var items = (w.items || []).map(clean);
      // 不認得的種類直接擋掉，不要存成便當蓋掉這週菜單
      var kind = w.kind || 'bento';
      if (KINDS.indexOf(kind) < 0) throw new Error('未知的菜單種類：' + kind);
      // 同一種限時團同時只能有一團收單中（跟前端 src/lib/drink.ts openConflict 一樣），不然新的會把還在收單的那團擠掉
      if (kind !== 'bento') {
        var open = allWeeks_().filter(function (x) { return x.kind === kind; })[0];
        if (open && open.id !== String(w.id) && Date.now() < new Date(open.deadline).getTime()) {
          throw new Error((open.host || '有人') + ' 已經開了' + (kind === 'drink' ? '飲料' : '點心') + '團，重新整理看看');
        }
      }
      var row = {
        id: String(w.id),
        shop: String(w.shop || ''),
        imageUrl: String(w.imageUrl || ''),
        deadline: new Date(w.deadline).toISOString(),
        items: JSON.stringify(items),
        note: '',
        createdAt: hit >= 0 ? rows[hit].createdAt : now,
        updatedAt: now,
        kind: kind,
        addons: JSON.stringify(kind === 'drink' ? (w.addons || []).map(clean) : []),
        host: kind !== 'bento' ? String(w.host || '').trim().slice(0, 20) : '',
        mode: w.mode === 'group' ? 'group' : 'treat', // 飲料團、點心團：treat 抖內、group 揪團
      };
      writeRow_(sheet, WEEK_COLS, row, hit >= 0 ? hit + 2 : null);
      return castWeek_(row);
    });
  },

  // 新增／修改／刪除（hidden）常用店家；p.from 是改名前的店名，舊名字記成刪掉
  adminSaveShop: function (p) {
    return withLock_(function () {
      var s = p.shop || {};
      if (KINDS.indexOf(s.kind) < 0) throw new Error('未知的菜單種類：' + s.kind);
      var name = String(s.shop || '').trim().slice(0, 40);
      if (!name) throw new Error('填一下店家名稱');
      var sheet = sheet_('shops');
      var rows = readRows_(sheet, SHOP_COLS);
      var now = new Date().toISOString();
      var put = function (row) {
        var hit = -1;
        for (var i = 0; i < rows.length; i++) if (rows[i].kind === row.kind && rows[i].shop === row.shop) { hit = i; break; }
        writeRow_(sheet, SHOP_COLS, row, hit >= 0 ? hit + 2 : null);
        if (hit < 0) rows.push(row);
      };
      var pairs = function (list) {
        return JSON.stringify((list || [])
          .map(function (x) { return [String(x[0] || '').trim(), Math.max(0, Math.round(Number(x[1]) || 0))]; })
          .filter(function (x) { return x[0]; }));
      };
      var from = String(p.from || '').trim().slice(0, 40);
      // 改名不能改成另一家已經有的名字，不然會蓋掉那家的菜單
      if (from && from !== name && rows.some(function (r) { return r.kind === s.kind && r.shop === name && r.hidden !== '1'; })) {
        throw new Error('已經有「' + name + '」了，點它來改');
      }
      if (from && from !== name) put({ kind: s.kind, shop: from, imageUrl: '', items: '[]', addons: '[]', hidden: '1', updatedAt: now });
      put({
        kind: s.kind, shop: name, imageUrl: String(s.imageUrl || ''), items: pairs(s.items),
        addons: pairs(s.kind === 'drink' ? s.addons : []), hidden: s.hidden ? '1' : '', updatedAt: now,
      });
      return allShops_();
    });
  },

  adminUploadImage: function (p) {
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
  ensureSheet_('shops', SHOP_COLS);
  imageFolder_(); // 順便觸發 Drive 授權
  Logger.log('完成，可以部署成網頁應用程式了');
}

// ───────────────────────── 資料

function allWeeks_() {
  return readRows_(sheet_('weeks'), WEEK_COLS)
    .map(castWeek_)
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function allShops_() {
  return readRows_(sheet_('shops'), SHOP_COLS).map(function (r) {
    return {
      kind: r.kind, shop: r.shop, imageUrl: r.imageUrl, items: parseList_(r.items), addons: parseList_(r.addons),
      hidden: r.hidden === '1', updatedAt: r.updatedAt,
    };
  });
}

function findWeek_(id) {
  var row = readRows_(sheet_('weeks'), WEEK_COLS).filter(function (r) { return r.id === id; })[0];
  return row ? castWeek_(row) : null;
}

function snapshot_(week) {
  if (!week) return { week: null, orders: [] };
  var orders = readRows_(sheet_('orders'), ORDER_COLS)
    .filter(function (o) { return o.weekId === week.id; })
    .map(castOrder_)
    .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  return { week: week, orders: orders };
}

function parseList_(v) {
  if (typeof v !== 'string') return v || [];
  try { return JSON.parse(v || '[]'); } catch (e) { return []; }
}

function castItems_(v) {
  return parseList_(v).map(function (it) { return { id: it.id, name: it.name, price: Number(it.price) || 0 }; }); // 舊資料沒有單價
}

function castWeek_(r) {
  return {
    id: r.id, kind: KINDS.indexOf(r.kind) >= 0 ? r.kind : 'bento', shop: r.shop, imageUrl: r.imageUrl, deadline: r.deadline,
    items: castItems_(r.items), addons: castItems_(r.addons), host: r.host || '', mode: r.mode === 'group' ? 'group' : 'treat',
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

function castOrder_(r) {
  return {
    id: r.id, weekId: r.weekId, name: r.name, itemId: r.itemId, itemName: r.itemName,
    options: r.options || '', addonIds: parseList_(r.addonIds),
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

// ───────────────────────── 試算表工具

function sheet_(name) {
  return ensureSheet_(name, COLS[name]);
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
  } else if (sh.getLastColumn() < cols.length) {
    // 舊試算表補上新欄位的表頭
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
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
