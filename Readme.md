# Classroom of the Elite — LN Reader

Static Light Novel reader. Không backend, không framework. Deploy lên **GitHub Pages**.

---

## Cấu trúc thư mục (quan trọng)

```
ln-reader/
│
├── index.html
├── style.css
├── app.js
├── data.js          ← Chỉ khai báo Year + Volume (không cần liệt kê chương)
│
└── content/
    ├── Năm 2/
    │   └── Volume 3/
    │       ├── Volume 3.txt      ← Toàn bộ nội dung volume trong 1 file
    │       └── images/
    │           ├── image_1.png
    │           └── image_2.jpeg
    └── Năm 3/
        ├── Volume 1/
        │   ├── Volume 1.txt
        │   └── images/
        ├── Volume 2/
        │   ├── Volume 2.txt
        │   └── images/
        └── Volume 3/
            ├── Volume 3.txt
            └── images/
```

---

## Định dạng file .txt

```
# Tên Chương 1

Nội dung đoạn 1...

Nội dung đoạn 2...

[img:image_1.png]

Tiếp tục nội dung...

## Tên Phần (tùy chọn)

Nội dung phần...

# Tên Chương 2

Nội dung chương 2...
```

**Quy tắc:**

| Cú pháp             | Ý nghĩa                                                         |
| ------------------- | --------------------------------------------------------------- |
| `# Tiêu đề`         | **Đầu chương** — mỗi dòng `#` tạo ra 1 chương mới trong sidebar |
| `## Tên phần`       | Heading phụ bên trong chương                                    |
| `[img:ten_anh.png]` | Chèn ảnh từ thư mục `images/` của volume đó                     |
| Dòng trống          | Phân cách đoạn văn                                              |

> ⚠ `[img:...]` phải đứng **một mình trên một dòng**, không có text cùng dòng.

---

## Thêm Volume mới vào data.js

```js
{
  id: "nam-3-vol-4",          // id duy nhất, không dấu
  label: "Volume 4",           // tên hiển thị trên UI
  translator: "Tên dịch giả", // để trống "" nếu không có
  file: "content/Năm 3/Volume 4/Volume 4.txt",
  imagesDir: "content/Năm 3/Volume 4/images/",
},
```

Sau đó tạo file và thư mục tương ứng là xong — **không cần khai báo từng chương**.
App tự parse `# Tiêu đề` trong txt và xây sidebar động.

---

## Chạy local & Deploy

```bash
# Bắt buộc dùng local server (không mở file:// trực tiếp)
python3 -m http.server 8080
# Truy cập: http://localhost:8080

# Deploy GitHub Pages
# Settings → Pages → branch main, folder / → Save
```

---

## Phím tắt

| Phím      | Hành động           |
| --------- | ------------------- |
| `←` / `→` | Chương trước / tiếp |
| `B`       | Ẩn/hiện sidebar     |
| `D`       | Đổi dark/light      |
