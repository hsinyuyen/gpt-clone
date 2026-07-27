/* 課程完成鎖（靜態頁共用）
 *
 * 規則：一堂課完成後，進入畫面就固定在「已完成 + 成品展示」，不讓學生重做；
 *       老師在後台開放重做時（redoAllowed=true）才會解開。
 *
 * 完成狀態存在 users/{uid}/progress/lessons，跟 src/lib/firestore.ts 的
 * getLessonCompletions / markLessonCompleted 是同一份資料。
 * 用 firebase compat SDK（靜態頁沒有打包工具，跟 l1-character.html 一致）。
 *
 * 使用前先在頁面載入：
 *   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
 *   <script src="/courses/lesson-lock.js"></script>
 */
(function (global) {
  var FB = {
    apiKey: "AIzaSyDVnab3BCfnlJH5cRCz_EqaHlP7yQUpK78",
    authDomain: "gpt-clone-68b9f.firebaseapp.com",
    projectId: "gpt-clone-68b9f",
    storageBucket: "gpt-clone-68b9f.firebasestorage.app",
    messagingSenderId: "436942056069",
    appId: "1:436942056069:web:8762675dfff7b7e92017ec",
  };

  var uid = null;
  var db = null;

  function session() {
    // 真正的來源是 sessionStorage（見 src/contexts/AuthContext.tsx：關閉瀏覽器就登出），
    // localStorage 只是給單檔遊戲／課程頁讀的鏡像。兩邊都看，跟 l1-character.html 一致。
    try {
      var r =
        sessionStorage.getItem("@session/currentUser") ||
        localStorage.getItem("@session/currentUser");
      return r ? JSON.parse(r) : null;
    } catch (e) {
      return null;
    }
  }

  function init() {
    if (db) return true;
    var u = session();
    if (!u || !u.id || !global.firebase) return false;
    uid = u.id;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FB);
      db = firebase.firestore();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 讀完成狀態表。沒登入或連不上就回空物件——寧可不鎖，也不要把人擋在外面。 */
  function load() {
    if (!init()) return Promise.resolve({});
    return db
      .collection("users").doc(uid)
      .collection("progress").doc("lessons")
      .get()
      .then(function (s) { return s.exists ? s.data() || {} : {}; })
      .catch(function () { return {}; });
  }

  /** 讀繪本主文件（L1 的成品來源） */
  function picturebook() {
    if (!init()) return Promise.resolve(null);
    return db
      .collection("users").doc(uid)
      .collection("picturebook").doc("main")
      .get()
      .then(function (s) { return s.exists ? s.data() : null; })
      .catch(function () { return null; });
  }

  /** 完成且老師沒開放重做 → 鎖住 */
  function isLocked(map, key, derivedCompleted) {
    var e = (map || {})[key];
    var done = derivedCompleted !== undefined ? derivedCompleted : !!(e && e.completed);
    return done && !(e && e.redoAllowed);
  }

  /** 標記完成；重新完成時收回老師開放的重做權限 */
  function markComplete(key, artifact) {
    if (!init()) return Promise.resolve(false);
    var entry = {
      completed: true,
      completedAt: new Date().toISOString(),
      redoAllowed: false,
      redoAllowedBy: null,
      redoAllowedByName: null,
      redoAllowedAt: null,
    };
    if (artifact) entry.artifact = artifact;
    var patch = {};
    patch[key] = entry;
    return db
      .collection("users").doc(uid)
      .collection("progress").doc("lessons")
      .set(patch, { merge: true })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  global.LessonLock = {
    get uid() { return uid || (session() || {}).id || null; },
    init: init,
    load: load,
    picturebook: picturebook,
    isLocked: isLocked,
    markComplete: markComplete,
  };
})(window);
