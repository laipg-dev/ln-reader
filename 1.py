"""
COTE Character Image Downloader
================================
Chay: python download_cote.py
Anh se duoc luu vao folder "cote_images" cung thu muc voi script nay.
"""

import os, re, time, random, urllib.request, urllib.parse, json

CHARS = [
    "Ai Morishita", "Airi Sakura", "Akane Tachibana", "Akito Miyake",
    "Albert Yamada", "Arisu Sakayanagi", "Atsuomi Ayanokoji", "Chiaki Matsushita",
    "Chie Hoshinomiya", "Chihiro Shiranami", "Daichi Ishizaki", "Fuka Kiryuin",
    "Hamaguchi Tetsuya", "Haruka Hasebe", "Haruki Yamauchi", "Hayato Kito",
    "Hideo Sotomura", "Hiyori Shiina", "Honami Ichinose", "Ichika Amasawa",
    "Ikuto Kiriyama", "Kakeru Ryuuen", "Kanji Ike", "Katsunori Shiba",
    "Kayano Onodera", "Kazuma Sakagami", "Kazuomi Hosen", "Kei Karuizawa",
    "Ken Sudo", "Kikyo Kushida", "Kiyotaka Ayanokoji", "Kokoro Inogashira",
    "Kyogo Komiya", "Kohei Katsuragi", "Kyo Ishigami", "Mako Amikura",
    "Manabu Horikita", "Masayoshi Hashimoto", "Masumi Kamuro", "Maya Sato",
    "Mika Kitagawa", "Mio Ibuki", "Miyabi Nagumo", "Nanami Yabu",
    "Nazuna Asahina", "Nene Mori", "Reo Kondo", "Riku Utomiya",
    "Rokusuke Koenji", "Ryuuji Kanzaki", "Sae Chabashira", "Sakurako Tsubaki",
    "Satoru Kaneda", "Satsuki Shinohara", "Sayo Ando", "Shiro",
    "So Shibata", "Suzune Horikita", "Takuya Yagami", "Teruhiko Yukimura",
    "Tomonari Mashima", "Tsubasa Nanase", "Tsukishiro", "Yahiko Totsuka",
    "Yuki Himeno", "Yukitsu Kusuda", "Yume Kobashi", "Yosuke Hirata",
]

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cote_images")
os.makedirs(OUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

def fetch(url, extra_headers=None):
    h = {**HEADERS, **(extra_headers or {})}
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()

def search_bing(name):
    """Tra ve list cac URL anh tu Bing Image Search"""
    q = urllib.parse.quote(name + " Classroom of the Elite anime character")
    url = f"https://www.bing.com/images/search?q={q}&form=HDRSC2&first=1"
    html = fetch(url).decode("utf-8", errors="ignore")
    # Bing luu direct image url trong murl
    urls = re.findall(r'"murl":"(https?://[^"]+)"', html)
    # Cung co the o dang encoded
    urls += [urllib.parse.unquote(u) for u in re.findall(r'murl&quot;:&quot;(https?[^&"]+)', html)]
    # Loc ra anh thuc su
    valid = []
    for u in urls:
        u = u.strip()
        if any(u.lower().endswith(ext) for ext in ['.jpg','.jpeg','.png','.webp','.gif']):
            if 'bing.com' not in u and 'microsoft.com' not in u:
                valid.append(u)
    return valid

def search_ddg(name):
    """DuckDuckGo fallback"""
    q = urllib.parse.quote(name + " Classroom of the Elite anime")
    # DDG Image API
    # Can lay VQD token truoc
    html = fetch(f"https://duckduckgo.com/?q={q}&iax=images&ia=images").decode("utf-8", errors="ignore")
    vqd = re.search(r'vqd=([\d-]+)', html)
    if not vqd:
        return []
    token = vqd.group(1)
    api = f"https://duckduckgo.com/i.js?q={q}&o=json&vqd={token}&f=,,,,,&p=1"
    try:
        data = json.loads(fetch(api, {"Referer": f"https://duckduckgo.com/?q={q}&iax=images&ia=images"}))
        return [r.get("image","") for r in data.get("results",[]) if r.get("image")]
    except:
        return []

def try_download(img_url, filepath):
    try:
        data = fetch(img_url)
        if len(data) < 3000:
            return False
        # Kiem tra header PNG/JPEG
        if data[:2] in (b'\xff\xd8', b'\x89P') or data[:4] == b'RIFF' or b'WEBP' in data[:12]:
            with open(filepath, 'wb') as f:
                f.write(data)
            return True
        # Thu luu anyway neu co data lon
        if len(data) > 10000:
            with open(filepath, 'wb') as f:
                f.write(data)
            return True
    except Exception as e:
        pass
    return False

def ext_from_url(url):
    url_lower = url.lower().split('?')[0]
    for e in ['.png','.gif','.webp','.jpeg','.jpg']:
        if url_lower.endswith(e):
            return e.replace('.','')
    return 'jpg'

def process(name):
    safe = re.sub(r'[<>:"/\\|?*]', '_', name)
    # Kiem tra neu da co anh
    for ext in ['jpg','png','webp','gif','jpeg']:
        if os.path.exists(os.path.join(OUT_DIR, f"{safe}.{ext}")):
            print(f"  [skip] {name} (da co)")
            return True

    urls = search_bing(name)
    time.sleep(random.uniform(0.3, 0.7))

    if not urls:
        urls = search_ddg(name)
        time.sleep(random.uniform(0.3, 0.6))

    for img_url in urls[:5]:
        ext = ext_from_url(img_url)
        filepath = os.path.join(OUT_DIR, f"{safe}.{ext}")
        if try_download(img_url, filepath):
            size_kb = os.path.getsize(filepath) // 1024
            print(f"  [OK] {name}  ({size_kb}KB)  {img_url[:60]}...")
            return True
        time.sleep(0.2)

    print(f"  [FAIL] {name}")
    return False

def main():
    print(f"Luu anh vao: {OUT_DIR}")
    print(f"Tong cong: {len(CHARS)} nhan vat\n")
    success, fail = [], []

    for i, name in enumerate(CHARS, 1):
        print(f"[{i:02d}/{len(CHARS)}] {name}")
        if process(name):
            success.append(name)
        else:
            fail.append(name)
        time.sleep(random.uniform(0.8, 1.5))

    # Thu lai cac nhan vat that bai lan 2
    if fail:
        print(f"\n--- Thu lai {len(fail)} nhan vat that bai ---")
        still_fail = []
        for name in fail:
            print(f"  retry: {name}")
            if process(name):
                success.append(name)
            else:
                still_fail.append(name)
            time.sleep(1.5)
        fail = still_fail

    print(f"\n{'='*50}")
    print(f"Thanh cong: {len(success)}/{len(CHARS)}")
    print(f"That bai:   {len(fail)}")
    if fail:
        print("Cac nhan vat that bai:")
        for n in fail: print(f"  - {n}")
    print(f"\nAnh da luu tai: {OUT_DIR}")

if __name__ == "__main__":
    main()
