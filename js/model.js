window.Money = (() => {
  const types = ["income", "expense", "deposit", "withdraw"];

  const object = x =>
    x !== null && typeof x === "object" && !Array.isArray(x);

  const validAmount = x =>
    Number.isSafeInteger(x) && x >= 0 && x <= 1e12;

  const validMonth = s =>
    typeof s === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(s) &&
    Number(s.slice(0, 4)) > 0;

  function validDate(s) {
    if (
      typeof s !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !validMonth(s.slice(0, 7))
    ) return false;

    const d = new Date(s + "T00:00:00Z");

    return !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === s;
  }

  function parse(raw) {
    let s = String(raw)
      .trim()
      .toLowerCase()
      .replace(/\s/g, "")
      .replace(/đ|₫/g, "");

    const unit = s.endsWith("tr")
      ? 1e6
      : s.endsWith("k") ? 1e3 : 1;

    s = unit === 1
      ? s.replace(/[.,]/g, "")
      : s.replace(/tr$|k$/, "").replace(",", ".");

    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) {
      throw Error(
        "Nhập số tiền hợp lệ, ví dụ 100000, 100k hoặc 1,5tr."
      );
    }

    const value = Number(s) * unit;
    const n = Math.round(value);

    if (
      !Number.isFinite(value) ||
      Math.abs(value - n) > 0.0001 ||
      !validAmount(Math.abs(n))
    ) {
      throw Error(
        "Số tiền phải là số nguyên, tối đa 1.000 tỷ đồng."
      );
    }

    return n;
  }

  const formatter = new Intl.NumberFormat("vi-VN");
  const format = n => formatter.format(n) + " ₫";
  const signed = t => t.reversed ? -t.amount : t.amount;

  function summary(data, month) {
    let income = data.months[month] || 0;
    let expense = 0;
    let savingNet = 0;
    let savings = 0;

    const tx = [];

    // Tính các tổng trong một lượt duyệt.
    for (const t of data.transactions) {
      const m = t.date.slice(0, 7);

      const transfer = t.type === "deposit"
        ? t.amount
        : t.type === "withdraw" ? -t.amount : 0;

      if (m <= month) savings += transfer;
      if (m !== month) continue;

      tx.push(t);

      if (t.type === "income") income += signed(t);
      if (t.type === "expense") expense += signed(t);

      savingNet += transfer;
    }

    return {
      income,
      expense,
      savingNet,
      savings,
      available: income - expense - savingNet,
      tx
    };
  }

  function fundBalance(data, id) {
    let total = 0;

    for (const t of data.transactions) {
      if (t.category !== id) continue;

      if (t.type === "deposit") total += t.amount;
      if (t.type === "withdraw") total -= t.amount;
    }

    return total;
  }

  function validate(data) {
    if (
      !object(data) ||
      data.version !== 1 ||
      !object(data.months) ||
      !Array.isArray(data.categories) ||
      !Array.isArray(data.transactions)
    ) {
      throw Error("File sao lưu không đúng định dạng.");
    }

    for (const [month, amount] of Object.entries(data.months)) {
      if (!validMonth(month) || !validAmount(amount)) {
        throw Error("Dữ liệu tháng không hợp lệ.");
      }
    }

    const categories = new Map();

    const validId = x =>
      typeof x === "string" &&
      x.length > 0 &&
      x.length <= 150 &&
      x !== "__income__";

    for (const c of data.categories) {
      if (
        !object(c) ||
        !validId(c.id) ||
        categories.has(c.id) ||
        !["expense", "saving"].includes(c.kind) ||
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 80 ||
        !validAmount(c.target)
      ) {
        throw Error("Danh mục không hợp lệ.");
      }

      categories.set(c.id, c);
    }

    const ids = new Set();
    const transfers = [];

    for (const t of data.transactions) {
      if (
        !object(t) ||
        !validId(t.id) ||
        ids.has(t.id) ||
        !types.includes(t.type) ||
        !validAmount(t.amount) ||
        t.amount === 0 ||
        !validDate(t.date) ||
        typeof t.note !== "string" ||
        t.note.length > 200 ||
        typeof t.category !== "string"
      ) {
        throw Error("Giao dịch không hợp lệ.");
      }

      if (
        t.reversed !== undefined &&
        (
          typeof t.reversed !== "boolean" ||
          !["income", "expense"].includes(t.type)
        )
      ) {
        throw Error("Dữ liệu hoàn tiền không hợp lệ.");
      }

      if (t.type === "income") {
        if (t.category !== "") {
          throw Error("Thu nhập không được gắn với mục chi tiêu.");
        }
      } else {
        const category = categories.get(t.category);
        const expected = t.type === "expense" ? "expense" : "saving";

        if (!category || category.kind !== expected) {
          throw Error("Giao dịch không khớp danh mục.");
        }
      }

      ids.add(t.id);

      if (t.type === "deposit" || t.type === "withdraw") {
        transfers.push(t);
      }
    }

    // Kiểm tra quỹ không bị âm theo thứ tự ngày.
    const balances = new Map();

    transfers.sort((a, b) => a.date.localeCompare(b.date));

    for (const t of transfers) {
      const balance = (balances.get(t.category) || 0) +
        (t.type === "deposit" ? t.amount : -t.amount);

      if (!Number.isSafeInteger(balance)) {
        throw Error("Tổng tiết kiệm quá lớn.");
      }

      if (balance < 0) {
        throw Error(
          "Khoản tiết kiệm bị âm. Kiểm tra ngày nạp/rút " +
          "hoặc giao dịch bạn đang xóa."
        );
      }

      balances.set(t.category, balance);
    }

    return data;
  }

  return { parse, format, summary, fundBalance, validate };
})();