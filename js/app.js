(() => {
  // Bổ sung hoàn tiền / giảm thu nhập, giữ tương thích dữ liệu cũ.
  const originalValidate = Money.validate;
  const originalSummary = Money.summary;
  const signedAmount = t => t.reversed ? -t.amount : t.amount;

  Money.validate = d => {
    originalValidate(d);

    for (const t of d.transactions) {
      if (
        t.reversed !== undefined &&
        (
          typeof t.reversed !== "boolean" ||
          !["expense", "income"].includes(t.type)
        )
      ) {
        throw Error("Dữ liệu hoàn tiền không hợp lệ.");
      }
    }

    return d;
  };

  Money.summary = (d, month) => {
    const s = originalSummary(d, month);

    s.income = (d.months[month] || 0) + s.tx
      .filter(t => t.type === "income")
      .reduce((n, t) => n + signedAmount(t), 0);

    s.expense = s.tx
      .filter(t => t.type === "expense")
      .reduce((n, t) => n + signedAmount(t), 0);

    s.available = s.income - s.expense - s.savingNet;

    return s;
  };

  // CSS bổ sung cho nút đổi dấu.
  const style = document.createElement("style");
  style.textContent = `
    .amount-row {
      display: flex;
      align-items: stretch;
      gap: 10px;
      margin-top: 5px;
    }

    .amount-row .amount-input {
      min-width: 0;
      flex: 1;
      margin: 0;
      text-align: left;
    }

    .sign-toggle {
      width: 68px;
      flex-shrink: 0;
      border-radius: 14px;
      font-size: 34px;
      padding: 0;
    }

    .sign-toggle.minus {
      background: #faeee8;
      color: #a44434;
    }

    .sign-toggle.plus {
      background: #e5f1e7;
      color: #287444;
    }

    #entry-hint {
      min-height: 38px;
    }
  `;
  document.head.append(style);

  const $ = selector => document.querySelector(selector);

  const esc = value => String(value).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );

  const today = () => {
    const d = new Date();

    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  };

  const id = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const cash = Money.format;

  let data;
  let month = today().slice(0, 7);
  let page = 0;
  let busy = false;
  let toastTimer;
  let pendingQuick = null;

  const channel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("tich-luy-sync")
    : null;

  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").style.display = "block";

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $("#toast").style.display = "none";
    }, 4000);
  }

  async function commit(change) {
    if (busy) return;
    busy = true;

    try {
      const next = structuredClone(data);

      change(next);
      Money.validate(next);
      await Store.save(next);

      data = next;
      channel?.postMessage("changed");

      render();
      toast("Đã lưu trên thiết bị này.");
    } catch (e) {
      toast(
        e.message ||
        "Không lưu được. Hãy xuất sao lưu và kiểm tra dung lượng."
      );
    } finally {
      busy = false;
    }
  }

  const heading = (number, title, subtitle) => `
    <div class="eyebrow">${number} / VÍ CÁ NHÂN</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
  `;

  function categoryExpense(summary, categoryId) {
    return summary.tx
      .filter(t => t.type === "expense" && t.category === categoryId)
      .reduce((n, t) => n + signedAmount(t), 0);
  }

  // ── Trang chủ ──────────────────────────────────────

  function categoryCard(kind, summary) {
    const saving = kind === "saving";
    const items = data.categories.filter(c => c.kind === kind);

    const list = items.map(c => {
      const used = saving
        ? Money.fundBalance(data, c.id)
        : categoryExpense(summary, c.id);

      const percent = c.target
        ? Math.round(used / c.target * 100)
        : 0;

      return `
        <div class="item">
          <div class="item-top">
            <span class="item-title">${esc(c.name)}</span>
            <b>${cash(used)}</b>
          </div>

          <small>
            ${
              c.target
                ? `${saving ? "Mục tiêu" : "Ngân sách"}:
                   ${cash(c.target)} · ${percent}%`
                : saving
                  ? "Tích lũy qua các tháng"
                  : "Chưa đặt ngân sách"
            }
          </small>

          ${
            c.target
              ? `
                <div class="bar ${percent > 100 ? "over" : ""}">
                  <i style="width:${
                    Math.max(0, Math.min(100, percent))
                  }%"></i>
                </div>
              `
              : ""
          }

          <div class="item-actions">
            ${
              saving
                ? `
                  <button
                    data-quick="deposit"
                    data-id="${esc(c.id)}"
                  >＋ Nạp</button>

                  <button
                    class="secondary"
                    data-quick="withdraw"
                    data-id="${esc(c.id)}"
                  >− Rút</button>
                `
                : `
                  <button
                    class="secondary"
                    data-quick="expense"
                    data-id="${esc(c.id)}"
                  >Ghi khoản chi</button>
                `
            }

            <button class="secondary" data-edit="${esc(c.id)}">
              Sửa
            </button>

            <button class="danger" data-remove="${esc(c.id)}">
              Xóa
            </button>
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="card">
        <div class="section-head">
          <h2>${
            saving ? "Để dành cho tương lai" : "Các mục chi tiêu"
          }</h2>
          <span class="tag">${items.length} mục</span>
        </div>

        <form data-form="category" data-kind="${kind}">
          <div class="row">
            <label>
              Tên khoản ${saving ? "tiết kiệm" : "chi tiêu"}
              <input
                name="name"
                maxlength="80"
                required
                placeholder="${
                  saving ? "Ví dụ: Mua điện thoại" : "Ví dụ: Ăn uống"
                }"
              >
            </label>

            <label>
              ${saving ? "Mục tiêu" : "Ngân sách tháng"} (tùy chọn)
              <input
                name="target"
                inputmode="decimal"
                placeholder="${saving ? "10tr" : "2tr"}"
              >
            </label>

            <button aria-label="Thêm mục">＋</button>
          </div>
        </form>

        ${
          list || `
            <div class="empty">
              ${
                saving
                  ? "Tạo khoản tiết kiệm đầu tiên của bạn."
                  : "Thêm mục để bắt đầu quản lý chi tiêu."
              }
            </div>
          `
        }
      </section>
    `;
  }

  function home(s) {
    return heading(
      "01",
      "Tiền của bạn, rõ ràng hơn.",
      "Một nơi nhỏ để sắp xếp tháng này và dành dụm cho mai sau."
    ) + `
      <section class="balance">
        <small>CÓ THỂ CHI TRONG THÁNG</small>
        <strong>${cash(s.available)}</strong>

        <div class="totals">
          <div>
            <small>Tổng thu</small>
            <b>${cash(s.income)}</b>
          </div>
          <div>
            <small>Đã chi</small>
            <b>${cash(s.expense)}</b>
          </div>
          <div>
            <small>Nạp tiết kiệm ròng</small>
            <b>${cash(s.savingNet)}</b>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Tiền đầu tháng</h2>
          <span class="tag">${esc(month)}</span>
        </div>

        <form data-form="base">
          <div class="row">
            <label>
              Tiền được cho / làm ra tháng này
              <input
                name="amount"
                inputmode="decimal"
                placeholder="Ví dụ: 5tr"
                value="${data.months[month] || ""}"
                required
              >
            </label>
            <button>Lưu số tiền</button>
          </div>
        </form>

        <p class="hint">
          Đây là số tiền ban đầu. Thu nhập phát sinh ghi ở Nhập nhanh.
          Sửa ô này sẽ thay thế số tiền đầu tháng.
        </p>
      </section>

      <div class="grid">
        ${categoryCard("expense", s)}
        ${categoryCard("saving", s)}
      </div>

      <p class="hint">
        Tiền có thể chi tính riêng từng tháng, không tự chuyển dư tháng trước.
        Khoản tiết kiệm giữ số dư qua các tháng.
        Danh mục và ngân sách tháng dùng chung giữa các tháng.
      </p>
    `;
  }

  // ── Nhập nhanh ─────────────────────────────────────

  function quick() {
    return heading(
      "02",
      "Ghi nhanh, nhẹ đầu.",
      "Chọn mục, nhập tiền, lưu lại."
    ) + `
      <section class="card quick">
        <form data-form="transaction">
          <label for="quick-amount">Số tiền</label>

          <div class="amount-row">
            <button
              id="sign-toggle"
              class="sign-toggle minus"
              type="button"
              aria-label="Đổi dấu, hiện tại là trừ"
            >−</button>

            <input
              id="quick-amount"
              class="amount-input"
              name="amount"
              inputmode="decimal"
              placeholder="100k"
              required
              autocomplete="off"
            >
          </div>

          <input type="hidden" name="sign" value="-">

          <div class="chips">
            <button type="button" data-amount="50k">50k</button>
            <button type="button" data-amount="100k">100k</button>
            <button type="button" data-amount="500k">500k</button>
            <button type="button" data-amount="1tr">1tr</button>
          </div>

          <label>
            Thuộc mục
            <select name="category"></select>
          </label>

          <p id="entry-hint" class="hint" aria-live="polite"></p>

          <div class="row">
            <label>
              Ngày
              <input
                name="date"
                type="date"
                required
                value="${
                  month === today().slice(0, 7)
                    ? today()
                    : month + "-01"
                }"
              >
            </label>

            <label>
              Ghi chú (tùy chọn)
              <input
                name="note"
                maxlength="200"
                placeholder="Ví dụ: Bữa trưa"
              >
            </label>
          </div>

          <button class="full">Lưu khoản tiền</button>
        </form>
      </section>
    `;
  }

  function fillCategories() {
    const f = $('[data-form="transaction"]');
    if (!f) return;

    const options = kind => data.categories
      .filter(c => c.kind === kind)
      .map(c => `
        <option value="${esc(c.id)}">${esc(c.name)}</option>
      `)
      .join("");

    f.elements.category.innerHTML = `
      <option value="">Chọn mục...</option>
      <option value="__income__">Được cho thêm / kiếm thêm</option>
      <optgroup label="Chi tiêu">${options("expense")}</optgroup>
      <optgroup label="Tiết kiệm">${options("saving")}</optgroup>
    `;

    setSign("-");
  }

  function setSign(sign) {
    const f = $('[data-form="transaction"]');
    if (!f) return;

    f.elements.sign.value = sign;

    const button = $("#sign-toggle");
    button.textContent = sign === "+" ? "+" : "−";
    button.className = "sign-toggle " + (
      sign === "+" ? "plus" : "minus"
    );

    button.setAttribute(
      "aria-label",
      "Đổi dấu, hiện tại là " + (sign === "+" ? "cộng" : "trừ")
    );

    updateHint();
  }

  function updateHint() {
    const f = $('[data-form="transaction"]');
    if (!f) return;

    const plus = f.elements.sign.value === "+";
    const selected = f.elements.category.value;
    const category = data.categories.find(c => c.id === selected);

    let message = "Bấm nút + / − để đổi dấu, rồi chọn mục.";

    if (selected === "__income__") {
      message = plus
        ? "Tăng thu nhập thêm."
        : "Điều chỉnh giảm thu nhập.";
    } else if (category?.kind === "saving") {
      message = plus
        ? "Nạp vào tiết kiệm; giảm tiền có thể chi."
        : "Rút tiết kiệm; tăng tiền có thể chi.";
    } else if (category) {
      message = plus
        ? "Hoàn tiền vào mục này; giảm số tiền đã chi."
        : "Chi tiền cho mục này.";
    }

    $("#entry-hint").textContent = message;
  }

  // ── Thống kê ───────────────────────────────────────

  function stats(s) {
    const tx = [...s.tx]
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date));

    const maxPage = Math.max(0, Math.ceil(tx.length / 20) - 1);
    page = Math.min(page, maxPage);

    const names = {
      income: "Thu thêm",
      expense: "Chi tiêu",
      deposit: "Nạp tiết kiệm",
      withdraw: "Rút tiết kiệm"
    };

    const categories = data.categories
      .filter(c => c.kind === "expense")
      .map(c => {
        const amount = categoryExpense(s, c.id);
        const width = s.expense > 0
          ? Math.max(0, Math.min(100, amount / s.expense * 100))
          : 0;

        return `
          <div class="item">
            <div class="item-top">
              <span>${esc(c.name)}</span>
              <b>${cash(amount)}</b>
            </div>
            <div class="bar">
              <i style="width:${width}%"></i>
            </div>
          </div>
        `;
      }).join("");

    const history = tx
      .slice(page * 20, page * 20 + 20)
      .map(t => {
        // Dấu hiển thị theo mục, giống nút đã chọn khi nhập.
        const plus =
          t.type === "deposit" ||
          (t.type === "income" && !t.reversed) ||
          (t.type === "expense" && t.reversed);

        const name = data.categories
          .find(c => c.id === t.category)?.name || "Thu nhập thêm";

        const description = t.reversed
          ? t.type === "expense" ? "Hoàn tiền" : "Giảm thu nhập"
          : names[t.type];

        return `
          <div class="transaction">
            <div class="meta">
              ${esc(name)}
              <small>
                ${esc(t.date)} · ${description}
                ${t.note ? " · " + esc(t.note) : ""}
              </small>
            </div>

            <b class="${plus ? "positive" : "negative"}">
              ${plus ? "+" : "−"}${cash(t.amount)}
            </b>

            <button
              class="danger"
              data-delete="${esc(t.id)}"
              aria-label="Xóa giao dịch"
            >×</button>
          </div>
        `;
      }).join("");

    return heading(
      "03",
      "Nhìn lại để đi xa hơn.",
      "Thu chi trong tháng, tiết kiệm qua thời gian."
    ) + `
      <div class="stats-grid">
        <div class="stat">
          <small>TỔNG THU THÁNG</small>
          <strong>${cash(s.income)}</strong>
        </div>
        <div class="stat">
          <small>TỔNG CHI THÁNG</small>
          <strong>${cash(s.expense)}</strong>
        </div>
        <div class="stat">
          <small>TIẾT KIỆM ĐẾN HẾT THÁNG</small>
          <strong>${cash(s.savings)}</strong>
        </div>
      </div>

      <section class="card">
        <div class="section-head">
          <h2>Chi tiêu theo mục</h2>
          <span class="tag">${cash(s.expense)}</span>
        </div>

        ${
          categories ||
          '<div class="empty">Chưa có mục chi tiêu.</div>'
        }
      </section>

      <section class="card">
        <div class="section-head">
          <h2>Lịch sử giao dịch</h2>
          <span class="tag">${tx.length} giao dịch</span>
        </div>

        ${
          data.months[month]
            ? `
              <div class="transaction">
                <div class="meta">
                  Tiền đầu tháng
                  <small>Sửa tại Trang chủ</small>
                </div>
                <b class="positive">+${cash(data.months[month])}</b>
              </div>
            `
            : ""
        }

        ${
          history ||
          '<div class="empty">Chưa có giao dịch trong tháng này.</div>'
        }

        ${
          maxPage
            ? `
              <div class="history-pages">
                <button
                  class="secondary"
                  data-page-step="-1"
                  ${page === 0 ? "disabled" : ""}
                >Trước</button>

                <small>${page + 1}/${maxPage + 1}</small>

                <button
                  class="secondary"
                  data-page-step="1"
                  ${page === maxPage ? "disabled" : ""}
                >Sau</button>
              </div>
            `
            : ""
        }

        <p class="hint">
          Dấu +/− phản ánh thao tác với mục đã chọn:
          + tiết kiệm là nạp, − là rút.
          Nạp/rút tiết kiệm không tính vào tổng thu/chi.
        </p>
      </section>

      <section class="card">
        <h2>Dữ liệu của bạn</h2>

        <p class="hint">
          Lưu riêng trên trình duyệt này.
          Xuất sao lưu định kỳ; xóa dữ liệu trình duyệt sẽ mất dữ liệu web.
        </p>

        <div class="settings" style="margin-top:16px">
          <button data-export>↓ Xuất sao lưu</button>
          <button class="secondary" data-import>↑ Nhập sao lưu</button>
          <button class="secondary" data-persist>
            Giữ dữ liệu lâu dài
          </button>
        </div>

        <input
          id="backup-file"
          type="file"
          accept=".json,application/json"
          hidden
        >

        <div id="storage-info" class="storage-info"></div>
      </section>
    `;
  }

  async function storageInfo() {
    try {
      const estimate = await navigator.storage?.estimate();
      const persisted = await navigator.storage?.persisted();
      const element = $("#storage-info");

      if (!element) return;

      element.textContent = (
        persisted
          ? "Đã được trình duyệt cấp lưu trữ bền vững."
          : "Chưa được cấp lưu trữ bền vững."
      ) + (
        estimate?.usage !== undefined
          ? " Dung lượng của website: " +
            (estimate.usage / 1024 / 1024).toFixed(2) + " MB."
          : ""
      );
    } catch {
      // Không ảnh hưởng chức năng lưu dữ liệu.
    }
  }

  // ── Điều hướng ─────────────────────────────────────

  function render() {
    const route = location.hash.slice(1) || "home";
    const summary = Money.summary(data, month);

    $("#main").innerHTML = route === "quick"
      ? quick()
      : route === "stats"
        ? stats(summary)
        : home(summary);

    const activePage = ["quick", "stats"].includes(route)
      ? route
      : "home";

    document.querySelectorAll("nav a").forEach(a => {
      const active = a.dataset.page === activePage;

      a.classList.toggle("active", active);

      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    if (route === "quick") {
      fillCategories();

      if (pendingQuick) {
        const f = $('[data-form="transaction"]');

        f.elements.category.value = pendingQuick.id;
        setSign(pendingQuick.type === "deposit" ? "+" : "-");

        pendingQuick = null;
        f.elements.amount.focus();
      }
    }

    if (route === "stats") storageInfo();
  }

  // ── Lưu biểu mẫu ───────────────────────────────────

  document.addEventListener("submit", async event => {
    const f = event.target;
    if (!f.dataset.form) return;

    event.preventDefault();
    const values = Object.fromEntries(new FormData(f));

    try {
      if (f.dataset.form === "base") {
        const amount = Money.parse(values.amount);

        if (amount < 0) {
          throw Error("Tiền đầu tháng không được âm.");
        }

        await commit(d => {
          d.months[month] = amount;
        });
      }

      if (f.dataset.form === "category") {
        const name = values.name.trim();

        if (!name) throw Error("Nhập tên mục.");

        const target = values.target.trim()
          ? Money.parse(values.target)
          : 0;

        if (target < 0) {
          throw Error("Ngân sách hoặc mục tiêu không được âm.");
        }

        await commit(d => {
          d.categories.push({
            id: id(),
            name,
            kind: f.dataset.kind,
            target
          });
        });
      }

      if (f.dataset.form === "transaction") {
        const raw = values.amount.trim();

        if (/^[+−-]/.test(raw)) {
          throw Error(
            "Dùng nút + / − để chọn dấu; ô số tiền chỉ nhập giá trị."
          );
        }

        const amount = Money.parse(raw);

        if (amount <= 0) {
          throw Error("Số tiền phải lớn hơn 0.");
        }

        const plus = values.sign === "+";
        const income = values.category === "__income__";
        const category = data.categories.find(
          c => c.id === values.category
        );

        if (!income && !category) {
          throw Error("Chọn một mục trước khi lưu.");
        }

        const type = income
          ? "income"
          : category.kind === "saving"
            ? plus ? "deposit" : "withdraw"
            : "expense";

        const transaction = {
          id: id(),
          type,
          category: income ? "" : category.id,
          amount,
          date: values.date,
          note: values.note.trim()
        };

        if (type === "income" || type === "expense") {
          transaction.reversed = type === "income" ? !plus : plus;
        }

        await commit(d => {
          d.transactions.push(transaction);
        });
      }
    } catch (e) {
      toast(e.message);
    }
  });

  // ── Chọn mục / nhập sao lưu ─────────────────────────

  document.addEventListener("change", async event => {
    if (event.target.name === "category") updateHint();

    if (event.target.id !== "backup-file") return;

    const file = event.target.files[0];
    if (!file) return;

    try {
      if (file.size > 50 * 1024 * 1024) {
        throw Error("File quá lớn (tối đa 50 MB cho mỗi lần nhập).");
      }

      const next = Money.validate(JSON.parse(await file.text()));

      if (!confirm(
        "Nhập bản sao lưu sẽ thay thế toàn bộ dữ liệu hiện tại. " +
        "Bạn đã xuất bản sao lưu hiện tại chưa?"
      )) return;

      await commit(d => {
        Object.keys(d).forEach(key => delete d[key]);
        Object.assign(d, next);
      });
    } catch (e) {
      toast(e.message);
    } finally {
      event.target.value = "";
    }
  });

  // ── Các nút thao tác ────────────────────────────────

  document.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.id === "sign-toggle") {
      const f = $('[data-form="transaction"]');
      setSign(f.elements.sign.value === "+" ? "-" : "+");
    }

    if (button.dataset.amount) {
      const f = $('[data-form="transaction"]');
      f.elements.amount.value = button.dataset.amount;
    }

    if (button.dataset.quick) {
      pendingQuick = {
        type: button.dataset.quick,
        id: button.dataset.id
      };

      if (location.hash === "#quick") render();
      else location.hash = "quick";
    }

    if (button.dataset.remove) {
      const category = data.categories.find(
        c => c.id === button.dataset.remove
      );

      if (data.transactions.some(t => t.category === category.id)) {
        toast(
          "Mục có giao dịch: giữ lại để bảo toàn lịch sử. Có thể sửa tên."
        );
        return;
      }

      if (confirm("Xóa mục “" + category.name + "”?")) {
        await commit(d => {
          d.categories = d.categories.filter(
            c => c.id !== category.id
          );
        });
      }
    }

    if (button.dataset.edit) {
      const category = data.categories.find(
        c => c.id === button.dataset.edit
      );

      const name = prompt("Tên mục:", category.name);
      if (name === null) return;

      const raw = prompt(
        category.kind === "saving"
          ? "Mục tiêu tiết kiệm (0 = không đặt):"
          : "Ngân sách tháng (0 = không đặt):",
        category.target
      );

      if (raw === null) return;

      try {
        const target = Money.parse(raw);

        if (
          !name.trim() ||
          name.trim().length > 80 ||
          target < 0
        ) {
          throw Error("Tên hoặc số tiền không hợp lệ.");
        }

        await commit(d => {
          Object.assign(
            d.categories.find(c => c.id === category.id),
            { name: name.trim(), target }
          );
        });
      } catch (e) {
        toast(e.message);
      }
    }

    if (
      button.dataset.delete &&
      confirm("Xóa giao dịch này? Số dư sẽ được tính lại.")
    ) {
      await commit(d => {
        d.transactions = d.transactions.filter(
          t => t.id !== button.dataset.delete
        );
      });
    }

    if (button.dataset.pageStep) {
      page += Number(button.dataset.pageStep);
      render();
    }

    if (button.hasAttribute("data-export")) {
      const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `tich-luy-sao-luu-${today()}.json`;
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Đã tạo bản sao lưu toàn bộ tháng.");
    }

    if (button.hasAttribute("data-import")) {
      $("#backup-file").click();
    }

    if (button.hasAttribute("data-persist")) {
      try {
        const ok = await navigator.storage?.persist?.();

        toast(
          ok
            ? "Trình duyệt đã cấp lưu trữ bền vững."
            : "Trình duyệt chưa cấp quyền. Bạn vẫn có thể lưu và xuất sao lưu."
        );

        storageInfo();
      } catch {
        toast("Trình duyệt không hỗ trợ yêu cầu này.");
      }
    }
  });

  // ── Khởi tạo ───────────────────────────────────────

  $("#month").value = month;

  $("#month").addEventListener("change", () => {
    if (!$("#month").value) return;

    month = $("#month").value;
    page = 0;
    render();
  });

  window.addEventListener("hashchange", () => {
    page = 0;
    render();
    window.scrollTo(0, 0);
  });

  if (channel) {
    channel.onmessage = () => location.reload();
  }

  Store.open()
    .then(d => {
      data = Money.validate(d);
      render();
    })
    .catch(e => {
      $("#main").innerHTML = `
        <section class="card">
          <h1>Chưa mở được dữ liệu</h1>
          <p>${esc(e.message)}</p>
          <p>
            Hãy dùng Chrome, Edge hoặc Safari ở chế độ thường.
            Nếu đang mở bằng file://, chạy máy chủ theo README rồi mở lại.
          </p>
          <button onclick="location.reload()">Thử lại</button>
        </section>
      `;
    });
})();