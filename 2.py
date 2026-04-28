from pathlib import Path
import re
import unicodedata

ROOT_DIR = Path("content")
OUTPUT_FILE = "danh_sach_ten.txt"

# Regex tìm tên riêng Latin
# Hỗ trợ cả dạng như Ayanokoji, Ayanokouji, Koenji, Sakayanagi...
NAME_PATTERN = re.compile(
    r"""
    \b
    (
        [A-Z][a-zA-Z]{1,}
        (?:\s+[A-Z][a-zA-Z]{1,}){0,3}
    )
    \b
    """,
    re.VERBOSE
)

# Danh sách tên / họ phổ biến trong Classroom of the Elite
# Bạn có thể thêm tiếp nếu bản dịch của bạn dùng tên khác
CLASSROOM_NAMES = {
    "Ayanokoji", "Ayanokouji", "Kiyotaka",
    "Horikita", "Suzune",
    "Kushida", "Kikyo", "Kikyō",
    "Sudo", "Sudou", "Ken",
    "Ike", "Kanji",
    "Yamauchi", "Haruki",
    "Sakura", "Airi",
    "Hirata", "Yosuke", "Yousuke",
    "Karuizawa", "Kei",
    "Koenji", "Kouenji", "Rokusuke",
    "Sakayanagi", "Arisu",
    "Ichinose", "Honami",
    "Ryuen", "Ryuuen", "Kakeru",
    "Katsuragi", "Kohei", "Kouhei",
    "Hashimoto", "Masayoshi",
    "Kanzaki", "Ryuji", "Ryuuji",
    "Ibuki", "Mio",
    "Ishizaki", "Daichi",
    "Albert", "Yamada",
    "Manabe", "Shiho",
    "Nagumo", "Miyabi",
    "Manabu",
    "Chabashira", "Sae",
    "Hoshinomiya", "Chie",
    "Mashima", "Tomonari",
    "Tsukishiro",
    "Nanase", "Tsubasa",
    "Hosen", "Housen", "Kazuomi",
    "Yagami", "Takuya",
    "Amasawa", "Ichika",
    "Kiriyama", "Ikuto",
    "Kiryuin", "Kiryuin", "Fuka", "Fuuka",
    "Matsushita", "Chiaki",
    "Mii", "Chan",
    "Wang", "Meiyu",
    "Shinohara", "Satsuki",
    "Satou", "Sato", "Maya",
    "Onodera", "Kayano",
    "Kobashi", "Yume",
    "Mori", "Nene",
    "Nishino", "Takeko",
    "Tachibana", "Akane"
}

STOPWORDS = {
    "Ta", "Tôi", "Toi", "Bạn", "Ban", "Hắn", "Han", "Nàng", "Nang",
    "Chàng", "Chang", "Cô", "Co", "Anh", "Em", "Ông", "Ong", "Bà", "Ba",
    "Ngày", "Ngay", "Đêm", "Dem", "Sáng", "Sang", "Chiều", "Chieu",
    "Tối", "Toi", "Khi", "Nếu", "Neu", "Nhưng", "Nhung", "Vì", "Vi",
    "Sau", "Trước", "Truoc", "Trong", "Ngoài", "Ngoai",
    "Một", "Mot", "Hai", "Ba", "Bốn", "Bon", "Năm", "Nam",
    "Lúc", "Luc", "Không", "Khong", "Có", "Co", "Là", "La"
}


def normalize_text(text: str) -> str:
    """
    Chuẩn hóa để so sánh tên.
    Ví dụ:
    Kikyō -> Kikyo
    Ayanokōji -> Ayanokoji
    """
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text


def read_text_file(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return file_path.read_text(encoding="utf-8-sig", errors="ignore")


def is_valid_name(name: str) -> bool:
    words = name.split()

    normalized_stopwords = {
        normalize_text(word).lower()
        for word in STOPWORDS
    }

    for word in words:
        clean_word = normalize_text(word)
        clean_word = re.sub(r"[^a-zA-Z]", "", clean_word)

        if len(clean_word) < 2:
            return False

        if clean_word.lower() in normalized_stopwords:
            return False

    return True


def belongs_to_classroom_of_the_elite(name: str) -> bool:
    """
    Chỉ giữ tên nếu ít nhất 1 phần trong cụm tên nằm trong danh sách nhân vật.
    Ví dụ:
    Ayanokoji Kiyotaka -> giữ
    Horikita -> giữ
    Một Ngày -> bỏ
    """
    normalized_classroom_names = {
        normalize_text(item).lower()
        for item in CLASSROOM_NAMES
    }

    words = name.split()

    for word in words:
        normalized_word = normalize_text(word).lower()
        if normalized_word in normalized_classroom_names:
            return True

    return False


def extract_unique_names(root_dir: Path):
    unique_names = set()

    normalized_classroom_names = {
        normalize_text(item).lower()
        for item in CLASSROOM_NAMES
    }

    txt_files = sorted(root_dir.rglob("*.txt"))

    for txt_file in txt_files:
        text = read_text_file(txt_file)
        matches = NAME_PATTERN.findall(text)

        for raw_name in matches:
            raw_name = " ".join(raw_name.split())

            if not is_valid_name(raw_name):
                continue

            words = raw_name.split()

            for word in words:
                clean_word = normalize_text(word)
                clean_word = re.sub(r"[^a-zA-Z]", "", clean_word)

                if len(clean_word) < 2:
                    continue

                normalized_word = clean_word.lower()

                # Chỉ giữ từ nào thật sự nằm trong danh sách tên Classroom of the Elite
                if normalized_word in normalized_classroom_names:
                    unique_names.add(clean_word)

    return sorted(unique_names)

def main():
    names = extract_unique_names(ROOT_DIR)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for name in names:
            f.write(name + "\n")

    print(f"Da tim thay {len(names)} ten rieng thuoc Classroom of the Elite.")
    print(f"Da luu vao file: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()