# Tích lũy — Ví cá nhân

Website thuần HTML / CSS / JavaScript, không thư viện bên ngoài, không đăng nhập, không gửi dữ liệu lên máy chủ.

## Chạy nhanh
1. Giải nén ZIP.
2. Mở `index.html` bằng trình duyệt. Một số trình duyệt hạn chế IndexedDB khi mở file trực tiếp. Cách ổn định là dùng một địa chỉ web cố định:
   - Cài Python nếu chưa có, mở terminal trong thư mục `tich-luy`.
   - Chạy `python -m http.server 8000` (macOS/Linux: `python3 -m http.server 8000`).
   - Mở http://localhost:8000 . Giữ nguyên địa chỉ và cổng để dùng lại dữ liệu.
   - Hoặc dùng Live Server trong VS Code.
3. Trên điện thoại: đặt các file lên một host web tĩnh HTTPS hoặc dùng máy chủ trong mạng Wi-Fi (truy cập IP máy tính:8000 khi máy chủ đang chạy). Dữ liệu trên điện thoại độc lập với máy tính. Tệp ZIP không phải ứng dụng cài trên điện thoại.

## Cách dùng
- Trang chủ: chọn tháng, nhập tiền đầu tháng. Giá trị này được thay thế khi sửa, không cộng dồn.
- Tạo danh mục chi và ngân sách tùy chọn. Danh mục/ngân sách dùng chung giữa các tháng; tổng đã chi tính theo tháng đang xem.
- Tiết kiệm: tên, mục tiêu tùy chọn, nạp/rút. Số dư tích lũy qua các tháng. Không cho rút âm tại bất kỳ ngày nào.
- Nhập nhanh: `-100k`, `+100k`, `1,5tr`, `100.000`; dấu tự chọn chi/thu. Đối với tiết kiệm, loại giao dịch quyết định nạp/rút, số tiền lấy giá trị tuyệt đối.
- Thống kê: tổng thu gồm tiền đầu tháng + thu phát sinh; tổng chi chỉ gồm chi tiêu. Nạp/rút không tính là thu nhập/chi phí.
- Tiền có thể chi = thu tháng − chi tháng − nạp tiết kiệm + rút tiết kiệm trong tháng. Không tự chuyển số dư khả dụng giữa tháng; cần tự đưa tiền chuyển tiếp vào tiền đầu tháng nếu muốn.
- Số dư tiết kiệm trên Trang chủ là số dư toàn bộ dữ liệu; thống kê tiết kiệm là số dư đến hết tháng chọn.
- Lịch sử 20 giao dịch/trang. Có thể xóa giao dịch sai; xóa giao dịch nạp bị chặn nếu làm quỹ âm.
- Mục đã có giao dịch không thể xóa; có thể sửa tên hoặc ngân sách/mục tiêu.

## Lưu trữ và sao lưu
IndexedDB lưu ngay trên trình duyệt sau mỗi thao tác. Dung lượng được trình duyệt quản lý, không đặt giới hạn nhỏ như localStorage; không thể cam kết một mức dung lượng cố định hoặc lưu mãi mãi. Phần thống kê cho biết lượng sử dụng và cho phép xin lưu trữ bền vững nếu trình duyệt hỗ trợ.

Lưu riêng theo thiết bị, trình duyệt và địa chỉ website (origin). Chuyển host/cổng, đổi trình duyệt hoặc dùng máy khác sẽ thấy dữ liệu riêng. Duyệt riêng tư, xóa dữ liệu website, hoặc cơ chế dọn dung lượng có thể làm mất dữ liệu. Lưu trữ bền vững không ngăn người dùng chủ động xóa. Xuất JSON định kỳ để giữ bản sao; có thể nhập JSON trên thiết bị khác. Nhập sẽ thay thế toàn bộ dữ liệu, có xác nhận và kiểm tra cấu trúc. Mỗi lần nhập giới hạn 50 MB để tránh mở file quá lớn; đây không phải hạn mức lưu của IndexedDB.

Dữ liệu tài chính không được mã hóa bằng mật khẩu trong bản này. Người có quyền mở trình duyệt của bạn có thể xem.

## Cấu trúc dễ nâng cấp
- `index.html`: khung giao diện và thanh điều hướng độc lập.
- `css/style.css`: màu sắc, thành phần và responsive.
- `js/model.js`: phân tích số tiền, công thức và kiểm tra dữ liệu.
- `js/storage.js`: IndexedDB; đổi lớp này nếu sau này cần backend.
- `js/app.js`: 3 trang, sự kiện nhập, sao lưu và điều hướng bằng hash.

Không cần npm hoặc bước build. Phiên bản dữ liệu hiện tại là 1. Khi thay schema, bổ sung migration trước khi thay version.
