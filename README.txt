LN Reader - fuzzy character portrait matching

Cac file can thay vao project:
- index.html
- app.js
- image_characters.js
- make_image_manifest.py

Neu folder anh cua ban la characters/ va ten file anh la ten day du cua nhan vat, app se:
1. Doc danh_sach_ten.txt de highlight ten trong truyen.
2. So khop fuzzy ten trong truyen voi ten file anh.
3. Chap nhan cac cach viet gan dung nhu Ryuen / Ryuuen, Koenji / Kouenji, Sudo / Sudou.
4. Bo qua cac tu khong map duoc toi anh, vi du nghe, so, yo, vai.

Sau khi them anh moi vao folder characters/, hay chay:
python make_image_manifest.py

Luu y: app can chay qua local server, vi browser khong cho fetch file txt khi mo truc tiep bang file://.
Vi du:
python -m http.server 8000
Sau do mo:
http://localhost:8000
