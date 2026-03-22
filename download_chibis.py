#!/usr/bin/env python3
"""앙상블 스타즈 치비 이미지 일괄 다운로드 스크립트"""

import json
import os
import re
import time
import urllib.request
import urllib.parse
import urllib.error

SAVE_DIR = os.path.join(os.path.dirname(__file__), "chibis")
API_URL = "https://ensemble-stars.fandom.com/api.php"

CHARACTERS = [
    "Subaru_Akehoshi", "Hokuto_Hidaka", "Makoto_Yuuki", "Mao_Isara",
    "Eichi_Tenshouin", "Wataru_Hibiki", "Tori_Himemiya", "Yuzuru_Fushimi",
    "Chiaki_Morisawa", "Kanata_Shinkai", "Tetora_Nagumo", "Midori_Takamine",
    "Shinobu_Sengoku", "Izumi_Sena", "Arashi_Narukami", "Ritsu_Sakuma",
    "Tsukasa_Suou", "Leo_Tsukinaga", "Rei_Sakuma", "Kaoru_Hakaze",
    "Koga_Oogami", "Adonis_Otogari", "Nazuna_Nito", "Mitsuru_Tenma",
    "Hajime_Shino", "Tomoya_Mashiro", "Keito_Hasumi", "Kuro_Kiryu",
    "Souma_Kanzaki", "Shu_Itsuki", "Mika_Kagehira", "Natsume_Sakasaki",
    "Tsumugi_Aoba", "Sora_Harukawa", "Madara_Mikejima", "Nagisa_Ran",
    "Hiyori_Tomoe", "Ibara_Saegusa", "Jun_Sazanami",
    "Rinne_Amagi", "HiMERU", "Kohaku_Oukawa", "Niki_Shiina",
    "Hiiro_Amagi", "Aira_Shiratori", "Mayoi_Ayase", "Tatsumi_Kazehaya",
    "Hinata_Aoi", "Yuta_Aoi", "Jin_Sagami", "Akiomi_Kunugi",
    "Kanna_Natsu", "Ibuki_Taki", "Fuyume_Hanamura", "Raika_Hojo",
    "Esu_Sagiri", "Nice_Arneb_Thunder", "Juis_Kojika", "Mashu_Kuon",
    "Chitose_Tsuzura", "Nozomi_Madoka",
]


def api_query(prefix, ai_continue=None):
    """MediaWiki API로 특정 prefix의 이미지 목록 조회"""
    params = {
        "action": "query",
        "list": "allimages",
        "aiprefix": prefix,
        "ailimit": "500",
        "aiprop": "url",
        "format": "json",
    }
    if ai_continue:
        params["aicontinue"] = ai_continue

    url = API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "EnstarChibiDownloader/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def get_chibi_urls(character):
    """캐릭터의 모든 치비 이미지 URL 반환"""
    chibi_images = []
    ai_continue = None

    while True:
        data = api_query(character, ai_continue)
        images = data.get("query", {}).get("allimages", [])

        for img in images:
            name = img["name"].lower()
            # Work_Unit_Outfit_Chibi 이미지만 필터
            if name.endswith("_work_unit_outfit_chibi.png"):
                chibi_images.append({
                    "name": img["name"],
                    "url": img["url"],
                })

        cont = data.get("continue")
        if cont and "aicontinue" in cont:
            ai_continue = cont["aicontinue"]
        else:
            break

    return chibi_images


def download_image(url, filepath):
    """이미지 다운로드"""
    req = urllib.request.Request(url, headers={"User-Agent": "EnstarChibiDownloader/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            with open(filepath, "wb") as f:
                f.write(resp.read())
        return True
    except urllib.error.URLError as e:
        print(f"  [에러] {e}")
        return False


def main():
    os.makedirs(SAVE_DIR, exist_ok=True)

    total_downloaded = 0
    total_skipped = 0

    for i, char in enumerate(CHARACTERS, 1):
        display_name = char.replace("_", " ")
        print(f"\n[{i}/{len(CHARACTERS)}] {display_name} 검색 중...")

        try:
            chibi_images = get_chibi_urls(char)
        except Exception as e:
            print(f"  [에러] API 요청 실패: {e}")
            time.sleep(2)
            continue

        if not chibi_images:
            print(f"  치비 이미지 없음")
            continue

        print(f"  {len(chibi_images)}개 치비 이미지 발견")

        for img in chibi_images:
            filename = img["name"]
            filepath = os.path.join(SAVE_DIR, filename)

            if os.path.exists(filepath):
                total_skipped += 1
                continue

            if download_image(img["url"], filepath):
                total_downloaded += 1
                print(f"  ✓ {filename}")
            else:
                print(f"  ✗ {filename}")

            time.sleep(0.3)  # 서버 부담 방지

        time.sleep(0.5)

    print(f"\n완료! 다운로드: {total_downloaded}개, 스킵(이미 존재): {total_skipped}개")
    print(f"저장 위치: {SAVE_DIR}")


if __name__ == "__main__":
    main()
