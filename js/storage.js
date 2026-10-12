/* One IndexedDB document. Writes complete before the UI reports success. */
window.Store = (() => {
  let db;
  const initial = () => ({version:1, months:{}, categories:[], transactions:[]});
  async function open() {
    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('tich-luy-personal', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Đóng tab Tích lũy khác rồi tải lại.'));
    });
    return new Promise((resolve,reject) => {
      const r = db.transaction('documents').objectStore('documents').get('ledger');
      r.onsuccess = () => resolve(r.result || initial()); r.onerror = () => reject(r.error);
    });
  }
  function save(data) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction('documents','readwrite');
      tx.objectStore('documents').put(data,'ledger');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Không thể lưu dữ liệu.'));
    });
  }
  return {open, save, initial};
})();
